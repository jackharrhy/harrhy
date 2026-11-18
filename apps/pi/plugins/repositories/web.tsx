// Owner-private work awareness: three native projections with an index and linked inspector, not a Git dashboard.
import { Access, BACKGROUND_CONTEXT, contribute, defineFacet, withCancel } from "@p2/app/v1";
import {
	BranchIcon,
	ConversationsIcon,
	EyeIcon,
	getNavigation,
	inPage,
	navigate,
	type OwnerPaneProps,
	OwnerViewKinds,
	RefreshIcon,
	SearchIcon,
	SideNavigation,
	shortPath,
	useConnected,
	useLinkHref,
	useObject,
	useReadable,
	useRoute,
} from "@p2/app/v1/web";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { GlyphIcon } from "../glyphs/GlyphIcon.tsx";
import { Projects } from "../projects/contract.ts";
import { placeSeed } from "../projects/glyph-seed.ts";
import { Sessions } from "../sessions/contract.ts";
import { ago, IconMarker, NavRow, useNow } from "../sessions/contract.web.tsx";
import { type ContextRead, type Preview, type PreviewRead, Repositories, type Scope } from "./contract.ts";
import {
	latestActivity,
	locationGroups,
	locationsForTree,
	previewState,
	previewsForSession,
	previewsForTree,
	sessionActivity,
	sessionMatches,
	type Worktree,
	worktreesOf,
} from "./model.ts";
import "./style.css";

type Projection = "sessions" | "worktrees" | "previews";
type Read<T> =
	| { kind: "idle" }
	| { kind: "loading"; previous?: T }
	| { kind: "ready"; value: T }
	| { kind: "failed"; previous?: T; message: string };
const TITLES = { sessions: "Sessions", worktrees: "Worktrees", previews: "Previews" } as const;

function readValue<T>(read: Read<T>): T | undefined {
	return read.kind === "ready" ? read.value : read.kind === "idle" ? undefined : read.previous;
}

function WorkContextPane({ session }: OwnerPaneProps) {
	const access = useObject(Access, {}, { variant: "owner" });
	const connected = useConnected();
	return connected && access ? <Inventory key={session} initialSession={session} /> : null;
}

function Inventory({ initialSession }: { initialSession: string }) {
	const service = useObject(Repositories, {}, { variant: "owner" });
	const catalog = useReadable(useObject(Sessions, {}, { variant: "owner" })?.sessions);
	const projectService = useObject(Projects, {}, { variant: "owner" });
	const projects = useReadable(projectService?.projects) ?? [];
	const memberships = useReadable(projectService?.sessions) ?? {};
	const seeds = useReadable(service?.seeds) ?? [];
	const locations = useReadable(service?.locations) ?? [];
	const route = useRoute();
	const detail = useMemo<{ projection: Projection; id: string } | undefined>(() => {
		if (route.ownerView?.kind !== "repositories") return undefined;
		// A restored browser history entry is untrusted serialized input.
		try {
			const value: unknown = JSON.parse(route.ownerView.locator);
			if (!value || typeof value !== "object" || !("projection" in value) || !("id" in value)) return undefined;
			const { projection, id } = value;
			return (projection === "sessions" || projection === "worktrees" || projection === "previews") &&
				typeof id === "string"
				? { projection, id }
				: undefined;
		} catch {
			return undefined;
		}
	}, [route.ownerView]);
	const [tab, setProjection] = useState<Projection>("sessions");
	const projection = detail?.projection ?? tab;
	const [selection, setChosen] = useState<Record<Projection, string | undefined>>({
		sessions: initialSession,
		worktrees: undefined,
		previews: undefined,
	});
	const chosen = detail ? { ...selection, [detail.projection]: detail.id } : selection;
	const detailOpen = detail !== undefined;
	const [query, setQuery] = useState("");
	const [context, setContext] = useState<Read<ContextRead>>({ kind: "idle" });
	const [previewRead, setPreviewRead] = useState<Read<PreviewRead>>({ kind: "idle" });
	const [revision, setRevision] = useState(0);
	const sidebarNow = useNow();
	const [leaseNow, setNow] = useState(Date.now);
	const now = Math.max(sidebarNow, leaseNow);
	const refreshedRevision = useRef(0);
	const operation = useRef<ReturnType<typeof withCancel> | undefined>(undefined);
	const href = useLinkHref();
	const data = readValue(context);
	const previewData = readValue(previewRead);
	const previews = previewData?.items ?? [];
	const trees = worktreesOf(data);
	// A related archived session must inspect itself, not silently fall back to an unrelated current session.
	const matchingSessions = (catalog ?? []).filter(
		(session) =>
			(session.archivedAt === null || session.id === chosen.sessions) &&
			sessionMatches(session, locations, previews, query),
	);
	const matchingTrees = trees.filter((tree) =>
		`${tree.repository} ${tree.tree.branch} ${tree.tree.path} ${locationsForTree(tree, locations, data)
			.map((location) => location.title)
			.join(" ")} ${previewsForTree(tree, previews, data)
			.map((preview) => preview.url)
			.join(" ")}`
			.toLowerCase()
			.includes(query.toLowerCase()),
	);
	const matchingPreviews = previews
		.filter((preview) => preview.url !== null)
		.filter((preview) =>
			`${preview.name} ${preview.url ?? ""} ${preview.location?.cwd ?? ""} ${preview.source} ${catalog?.find((session) => session.id === preview.session)?.title ?? ""}`
				.toLowerCase()
				.includes(query.toLowerCase()),
		);
	const session = matchingSessions.find((session) => session.id === chosen.sessions) ?? matchingSessions[0];
	const worktree = matchingTrees.find((tree) => tree.id === chosen.worktrees) ?? matchingTrees[0];
	const preview = matchingPreviews.find((preview) => preview.id === chosen.previews) ?? matchingPreviews[0];
	const sessionId = session?.id;
	const previewId = preview?.id;
	const scope = useMemo<Scope | undefined>(
		() =>
			projection === "worktrees"
				? { kind: "all" }
				: projection === "sessions"
					? sessionId
						? { kind: "session", id: sessionId }
						: undefined
					: previewId
						? { kind: "preview", id: previewId }
						: undefined,
		[projection, sessionId, previewId],
	);
	const evidence = JSON.stringify([
		seeds.map((seed) => seed.id),
		locations.map(({ session, conversation, env, cwd }) => [session, conversation, env, cwd]),
		previews.map(({ id, location }) => [id, location]),
	]);

	useEffect(() => {
		if (!service) return;
		const call = withCancel(BACKGROUND_CONTEXT);
		let active = true;
		setPreviewRead((previous) => ({ kind: "loading", previous: readValue(previous) }));
		void service.previews({ refresh: revision > 0 }, call.context).then(
			(value) => {
				if (active) setPreviewRead({ kind: "ready", value });
			},
			() => {
				if (active)
					setPreviewRead((previous) => ({
						kind: "failed",
						previous: readValue(previous),
						message: "Preview metadata unavailable. Refresh to retry.",
					}));
			},
		);
		return () => {
			active = false;
			call.cancel();
		};
	}, [service, revision]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only changed path evidence invalidates associations; activity/title updates do not run Git.
	useEffect(() => {
		if (!service || !scope) {
			setContext({ kind: "idle" });
			return;
		}
		const call = withCancel(BACKGROUND_CONTEXT);
		operation.current = call;
		const reread = revision > refreshedRevision.current;
		let active = true;
		setContext((previous) => ({ kind: "loading", previous: readValue(previous) }));
		void service.context({ scope, refresh: reread }, call.context).then(
			(value) => {
				if (active) {
					refreshedRevision.current = revision;
					setContext({ kind: "ready", value });
				}
			},
			() => {
				if (active)
					setContext((previous) => ({
						kind: "failed",
						previous: readValue(previous),
						message: call.context.abortSignal?.aborted
							? "Read cancelled. Refresh to retry."
							: "Worktree context unavailable. Refresh to retry.",
					}));
			},
		);
		return () => {
			active = false;
			call.cancel();
		};
	}, [service, scope, evidence, revision]);

	useEffect(() => {
		const next = previews
			.flatMap((preview) => (preview.lease.kind === "expires" && preview.lease.at > now ? [preview.lease.at] : []))
			.sort((a, b) => a - b)[0];
		if (next === undefined) return;
		// Timer API limit, not a product lifetime cap. Re-evaluate long leases rather than overflow into a hot loop.
		const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, next - Date.now()), 2 ** 31 - 1));
		return () => clearTimeout(timer);
	}, [previews, now]);

	const select = (kind: Projection, id: string) => {
		setChosen((previous) => ({ ...previous, [kind]: id }));
		setQuery("");
		void getNavigation().push({
			...route,
			ownerView: { kind: "repositories", locator: JSON.stringify({ projection: kind, id }) },
		});
	};
	const glyph = (env: string | null, cwd: string, member?: string, working = false) => (
		<IconMarker working={working}>
			<GlyphIcon seed={placeSeed(projects, env, cwd, member)} />
		</IconMarker>
	);
	const sessionMarker = (id: string) => {
		const session = catalog?.find((session) => session.id === id);
		return session ? (
			glyph(session.env ?? null, session.cwd, memberships[id], sessionActivity(id, locations) === "Working")
		) : (
			<ConversationsIcon size={16} />
		);
	};
	const sessionRow = (id: string) => {
		const session = catalog?.find((session) => session.id === id);
		return session ? (
			<InspectorRow
				key={id}
				id={id}
				label={session.title}
				marker={sessionMarker(id)}
				detail={
					session.archivedAt === null ? (
						<Age
							at={session.updatedAt}
							now={now}
							event="Session indexed activity (messages and location moves)"
						/>
					) : (
						"Archived"
					)
				}
				onSelect={() => select("sessions", id)}
			/>
		) : (
			<p key={id} className="empty-note">
				Session no longer listed.
			</p>
		);
	};
	const treeRow = (tree: Worktree) => (
		<InspectorRow
			key={tree.id}
			id={tree.id}
			label={`${tree.repository} / ${tree.tree.branch || (tree.tree.bare ? "bare" : "detached")}`}
			marker={glyph(null, tree.tree.path)}
			onSelect={() => select("worktrees", tree.id)}
			title={tree.tree.path}
		/>
	);
	const previewRow = (preview: Preview) => (
		<InspectorRow
			key={preview.id}
			id={preview.id}
			label={preview.name}
			marker={<EyeIcon size={16} />}
			detail={
				previewState(preview, now) || (
					<Age at={preview.event?.at} now={now} event={`Preview ${preview.event?.kind ?? "activity"}`} />
				)
			}
			title={preview.url ?? "Address unavailable"}
			subtitle={preview.url ? new URL(preview.url).host : undefined}
			onSelect={() => select("previews", preview.id)}
		/>
	);
	const relatedPreviews = (items: Preview[]) => (
		<>
			<InspectorList label="Associated previews">
				{items.filter((preview) => preview.url !== null).map(previewRow)}
			</InspectorList>
			{!items.some((preview) => preview.url !== null) && (
				<p className="context-note">No associated preview recorded.</p>
			)}
		</>
	);
	const title =
		projection === "sessions"
			? session?.title
			: projection === "worktrees"
				? worktree
					? `${worktree.repository} / ${worktree.tree.branch || (worktree.tree.bare ? "bare" : "detached")}`
					: undefined
				: preview?.name;
	const ownLocations = session ? locations.filter((location) => location.session === session.id) : [];
	const treeLocations = worktree ? locationsForTree(worktree, locations, data) : [];
	const resolvedPreviewTrees = preview
		? trees.filter((tree) => previewsForTree(tree, [preview], data).length > 0)
		: [];

	return (
		<section className={`work-context list-page ${detailOpen ? "detail-open" : ""}`} aria-label="Work context">
			<header className="work-context-head">
				<h2>Work context</h2>
				<button
					type="button"
					className="icon-button"
					aria-label="Refresh work context"
					title="Refresh work context"
					disabled={context.kind === "loading" || previewRead.kind === "loading"}
					onClick={() => {
						setRevision((value) => value + 1);
					}}
				>
					<RefreshIcon />
				</button>
			</header>
			<nav className="work-context-tabs" aria-label="Work context views">
				{(["sessions", "worktrees", "previews"] as const).map((kind) => (
					<button
						type="button"
						key={kind}
						aria-pressed={projection === kind}
						onClick={() => {
							setProjection(kind);
							void getNavigation().close({ ...route, ownerView: undefined });
							setQuery("");
						}}
					>
						{kind === "sessions" ? (
							<ConversationsIcon size={16} />
						) : kind === "worktrees" ? (
							<BranchIcon size={16} />
						) : (
							<EyeIcon size={16} />
						)}
						{TITLES[kind]}
					</button>
				))}
			</nav>
			<label className="search context-search">
				<SearchIcon />
				<input
					type="search"
					aria-label="Filter work context"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={`Filter ${TITLES[projection].toLowerCase()}`}
				/>
			</label>
			<div className="context-panes">
				<div className="context-index">
					<InspectorList label={TITLES[projection]}>
						{projection === "sessions" &&
							matchingSessions.map((session) => (
								<InspectorRow
									key={session.id}
									id={session.id}
									label={session.title}
									marker={sessionMarker(session.id)}
									detail={
										session.archivedAt === null ? (
											<Age
												at={session.updatedAt}
												now={now}
												event="Session indexed activity (messages and location moves)"
											/>
										) : (
											"Archived"
										)
									}
									selected={session.id === sessionId}
									onSelect={() => select("sessions", session.id)}
								/>
							))}
						{projection === "worktrees" &&
							matchingTrees.map((tree) => (
								<InspectorRow
									key={tree.id}
									id={tree.id}
									label={tree.tree.branch || (tree.tree.bare ? "Bare repository" : "Detached HEAD")}
									marker={glyph(
										null,
										tree.tree.path,
										undefined,
										locationsForTree(tree, locations, data).some(
											(location) => location.activity === "Working",
										),
									)}
									detail={
										<Age
											at={latestActivity(locationsForTree(tree, locations, data))}
											now={now}
											event="Latest recorded associated message"
										/>
									}
									selected={tree.id === worktree?.id}
									title={`${tree.repository}: ${tree.tree.path}`}
									onSelect={() => select("worktrees", tree.id)}
									subtitle={tree.repository}
								/>
							))}
						{projection === "previews" &&
							matchingPreviews.map((preview) => (
								<InspectorRow
									key={preview.id}
									id={preview.id}
									label={preview.name}
									marker={<EyeIcon size={16} />}
									detail={
										previewState(preview, now) || (
											<Age
												at={preview.event?.at}
												now={now}
												event={`Preview ${preview.event?.kind ?? "activity"}`}
											/>
										)
									}
									selected={preview.id === previewId}
									title={preview.url ?? "Address unavailable"}
									subtitle={preview.url ? new URL(preview.url).host : undefined}
									onSelect={() => select("previews", preview.id)}
								/>
							))}
					</InspectorList>
					{projection === "sessions" && !matchingSessions.length && (
						<p className="empty-note">{catalog ? "No matching current sessions." : "Loading sessions…"}</p>
					)}
					{projection === "worktrees" && !matchingTrees.length && (
						<p className="empty-note">
							{context.kind === "loading"
								? "Reading known repositories…"
								: "No matching registered worktrees observed."}
						</p>
					)}
					{projection === "previews" && !matchingPreviews.length && (
						<p className="empty-note">
							{previewRead.kind === "loading" ? "Reading preview metadata…" : "No matching previews supplied."}
						</p>
					)}
				</div>
				<article className="context-inspector">
					<button type="button" className="text-action context-back" onClick={() => void getNavigation().back()}>
						Back
					</button>
					{title ? (
						<>
							<h3 className="context-title">
								{projection === "sessions" && session ? (
									sessionMarker(session.id)
								) : projection === "worktrees" && worktree ? (
									glyph(null, worktree.tree.path)
								) : (
									<EyeIcon size={16} />
								)}
								{title}
							</h3>
							{projection === "sessions" && session && (
								<>
									{session.archivedAt !== null && (
										<p className="context-note">Archived session · last reported locations</p>
									)}
									{session.archivedAt === null && (
										<a
											className="text-action context-open"
											href={href({ session: session.id, conversation: session.main, layers: [] })}
											onClick={inPage(() => navigate({ session: session.id, conversation: session.main }))}
										>
											Open session
										</a>
									)}
									<h4>Conversations &amp; worktrees</h4>
									{locationGroups(ownLocations, data).map((group) => (
										<LocationGroupRow
											key={group.id}
											group={group}
											glyph={glyph}
											select={select}
											now={now}
											href={href}
										/>
									))}
									<h4>Previews</h4>
									{relatedPreviews(previewsForSession(session.id, locations, previews, data))}
								</>
							)}
							{projection === "worktrees" && worktree && (
								<>
									<p className="context-line">{worktree.tree.path}</p>
									<p className="context-note">
										{treePresence(worktree)}
										{worktree.tree.locked !== undefined ? " · Locked" : ""}
									</p>
									<h4>Located sessions</h4>
									<InspectorList label="Sessions at this worktree">
										{[...new Set(treeLocations.map((location) => location.session))].map(sessionRow)}
									</InspectorList>
									{!treeLocations.length && (
										<p className="context-note">No located session. This does not mean unused.</p>
									)}
									{locationGroups(treeLocations, data).map((group) => (
										<LocationGroupRow
											key={group.id}
											group={group}
											glyph={glyph}
											select={select}
											now={now}
											href={href}
										/>
									))}
									<h4>Previews</h4>
									{relatedPreviews(previewsForTree(worktree, previews, data))}
								</>
							)}
							{projection === "previews" && preview && (
								<>
									<p className="context-line">{preview.url ?? "Address unavailable"}</p>
									<p className="context-note">
										{preview.access}
										{previewState(preview, now) && ` · ${previewState(preview, now)}`}
										{preview.lease.kind === "expires" && preview.lease.at > now && (
											<span title={`Lease expires ${new Date(preview.lease.at).toLocaleString()}`}>
												{" "}
												· Expires{" "}
												{new Date(preview.lease.at).toLocaleTimeString(undefined, {
													hour: "2-digit",
													minute: "2-digit",
												})}
											</span>
										)}
									</p>
									{preview.url && previewState(preview, now) !== "Expired" ? (
										<a
											className="text-action context-open"
											href={preview.url}
											target="_blank"
											rel="noopener noreferrer"
											onClick={(event) => {
												if (preview.lease.kind === "expires" && preview.lease.at <= Date.now())
													event.preventDefault();
											}}
										>
											Open preview
										</a>
									) : (
										<p className="context-note">
											{preview.url
												? "Lease expired; opening is unavailable."
												: "No address supplied by the provider."}
										</p>
									)}
									<h4>Session attribution</h4>
									<InspectorList label="Preview's declared session">
										{preview.session ? sessionRow(preview.session) : null}
									</InspectorList>
									{!preview.session && <p className="context-note">Unknown session association.</p>}
									<h4>Worktree</h4>
									<InspectorList label="Preview's resolved worktree">
										{resolvedPreviewTrees.map(treeRow)}
									</InspectorList>
									{!resolvedPreviewTrees.length && (
										<p className="context-note">
											{preview.location
												? "Declared location · worktree unresolved."
												: "Unknown served worktree."}
										</p>
									)}
									{preview.location && (
										<p className="context-line">
											{preview.location.env ? `${preview.location.env}:` : ""}
											{preview.location.cwd}
										</p>
									)}
									<details className="context-source">
										<summary>Registration details</summary>
										<p className="context-note">{preview.source}</p>
										<p className="context-note">
											{preview.lease.kind === "expires"
												? `Lease expires ${new Date(preview.lease.at).toLocaleString()}`
												: preview.lease.kind === "none"
													? "Nonexpiring link, explicitly declared."
													: "Expiry not supplied."}
										</p>
										<p className="context-note">{preview.note}</p>
									</details>
								</>
							)}
						</>
					) : (
						<p className="empty-note">Select an item to see its context.</p>
					)}
				</article>
			</div>
			<footer className="context-freshness">
				{context.kind === "loading" ? (
					<>
						<span>Reading worktree context…</span>
						<button type="button" className="text-action" onClick={() => operation.current?.cancel()}>
							Cancel read
						</button>
					</>
				) : null}
				{projection === "previews" && (
					<span title="Registration metadata only; health is not checked. Expiry concerns the route, not its process.">
						Registered links · health not checked
					</span>
				)}
				{projection === "previews" && previews.some((preview) => !preview.url) && (
					<details>
						<summary>{previews.filter((preview) => !preview.url).length} unlinked records</summary>
						{previews
							.filter((preview) => !preview.url)
							.map((preview) => (
								<p key={preview.id}>
									{preview.name} · {preview.source}
								</p>
							))}
					</details>
				)}
				{context.kind === "failed" && <output>{context.message}</output>}
				{previewRead.kind === "failed" && <output>{previewRead.message}</output>}
				{previewData?.failures.map((failure) => (
					<output key={failure}>{failure}</output>
				))}
				{data && data.failures.length > 0 && (
					<details>
						<summary>Some locations not checked</summary>
						{data.failures.map((failure) => (
							<p key={failure.location} className="context-line">
								{failure.location}: {failure.error}
							</p>
						))}
					</details>
				)}
			</footer>
		</section>
	);
}

function treePresence(worktree: Worktree): string {
	return worktree.tree.prunable !== undefined
		? "Prunable registration"
		: worktree.tree.presence === "existing"
			? "Existing worktree"
			: worktree.tree.presence === "missing"
				? "Missing registered path"
				: "Presence unavailable";
}

function Age({ at, now, event }: { at?: number; now: number; event: string }) {
	return at === undefined ? null : (
		<time
			className="session-time"
			dateTime={new Date(at).toISOString()}
			title={`${event}: ${new Date(at).toLocaleString()}`}
		>
			{ago(at, now)}
		</time>
	);
}

function LocationGroupRow({
	group,
	glyph,
	select,
	now,
	href,
}: {
	group: ReturnType<typeof locationGroups>[number];
	glyph: (env: string | null, cwd: string, member?: string, working?: boolean) => ReactNode;
	select: (kind: Projection, id: string) => void;
	now: number;
	href: ReturnType<typeof useLinkHref>;
}) {
	const [open, setOpen] = useState(false);
	const first = group.locations[0]!;
	const tree = group.worktree;
	const working = group.locations.some((location) => location.activity === "Working");
	const label = tree
		? `${tree.repository} / ${tree.tree.branch || "detached"}`
		: `${first.env ? `${first.env}:` : ""}${shortPath(first.cwd)}`;
	return (
		<div className="context-location-group">
			<NavRow
				marker={glyph(first.env, tree?.tree.path ?? first.cwd, undefined, working)}
				label={<span className="session-title">{label}</span>}
				expanded={open}
				onActivate={() => setOpen(!open)}
				details={
					<>
						<span>{group.locations.length}</span>
						<Age at={latestActivity(group.locations)} now={now} event="Latest recorded associated message" />
					</>
				}
				title={
					tree
						? `${tree.tree.path} · ${treePresence(tree)}`
						: `${first.cwd} · ${first.env ? "Remote inspection unavailable" : "Unresolved worktree"}`
				}
			/>
			<p className="context-row-subtitle">
				{tree ? treePresence(tree) : first.env ? "Remote · inspection unavailable" : "Worktree unresolved"}
				{tree && (
					<button type="button" className="text-action" onClick={() => select("worktrees", tree.id)}>
						Inspect
					</button>
				)}
			</p>
			{open && (
				<InspectorList label={`Conversations in ${label}`}>
					{group.locations.map((location) => (
						<SideNavigation.Item key={`${location.session}:${location.conversation}`}>
							<NavRow
								marker={glyph(location.env, location.cwd, undefined, location.activity === "Working")}
								label={<span className="session-title">{location.title}</span>}
								href={
									location.archived
										? undefined
										: href({ session: location.session, conversation: location.conversation, layers: [] })
								}
								onActivate={() => {
									if (!location.archived)
										navigate({ session: location.session, conversation: location.conversation });
								}}
								title={`${location.kind === "child" ? "Recorded subagent" : "Conversation"}${location.archived ? " · Archived" : ""} · ${location.cwd}`}
								details={
									<>
										{location.activity === "Failed" && <span>Failed</span>}
										<Age at={location.updatedAt} now={now} event="Newest conversation message" />
									</>
								}
							/>
						</SideNavigation.Item>
					))}
				</InspectorList>
			)}
		</div>
	);
}

function InspectorList({ label, children }: { label: string; children: ReactNode }) {
	return (
		<SideNavigation.Root className="sidebar-nav" aria-label={label}>
			<SideNavigation.List>{children}</SideNavigation.List>
		</SideNavigation.Root>
	);
}

function InspectorRow({
	id,
	label,
	marker,
	detail,
	selected = false,
	title,
	subtitle,
	onSelect,
}: {
	id: string;
	label: string;
	marker: ReactNode;
	detail?: ReactNode;
	selected?: boolean;
	title?: string;
	subtitle?: string;
	onSelect: () => void;
}) {
	return (
		<SideNavigation.Item data-context-id={id}>
			<NavRow
				selected={selected}
				marker={marker}
				label={<span className="session-title">{label}</span>}
				details={detail}
				title={title}
				onActivate={onSelect}
			/>
			{subtitle && <p className="context-row-subtitle">{subtitle}</p>}
		</SideNavigation.Item>
	);
}

export default defineFacet((host) => {
	contribute(host, "p2.web-repositories", (self) =>
		self.contribute(OwnerViewKinds, { repositories: { title: "Work context", Pane: WorkContextPane } }),
	);
});
