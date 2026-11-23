// The sidebar and its list pages (sidebar/: the rollups' rules and their views) with the catalog, status, subagent,
// search and settings handles supplying their data, the owner's session actions on the rows, the session
// and rollup sheets, and the sessions' command menu commands (commands.tsx).

import {
	Access,
	BACKGROUND_CONTEXT,
	contribute,
	defineFacet,
	grantMode,
	type HeldIn,
	keptIn,
	liveIn,
	whenLive,
} from "@p2/app/v1";
import {
	CommandPages,
	CommandSearches,
	Commands,
	closeLayers,
	getNavigation,
	type Layer,
	MoreIcon,
	NEW_SESSION,
	navigate,
	openLayer,
	openPage,
	rememberMains,
	SlotList,
	Slots,
	startNewSession,
	toggleSidebar,
	useComposerState,
	useConnected,
	useHost,
	useNavigation,
	useObject,
	useOptimisticCall,
	useOwner,
	useReadable,
	useRoute,
	useSheet,
} from "@p2/app/v1/web";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Envs } from "../envs/contract.ts";
import { DirectoryPicker, directoryPickerLayer } from "../envs/contract.web.tsx";
import { Search, SessionReads } from "../search/contract.ts";
import { SessionStatus } from "../status/contract.ts";
import { type Child, Subagents } from "../subagents/contract.ts";
import { archiveSubagent, stopRuns } from "./agent-actions.ts";
import { SESSION_COMMANDS, SESSION_PAGES, SESSION_SEARCH } from "./commands.tsx";
import { type Operation, type Session, Sessions, SidebarSettings, type SidebarWindow } from "./contract.ts";
import { type DrawerRows, DrawerRowsContext } from "./contract.web.tsx";
import { SessionSheet } from "./SessionSheet.tsx";
import { ListPage } from "./sidebar/ListPage.tsx";
import {
	arranged,
	listPageOf,
	movable,
	moved,
	type NewTarget,
	ROLLUPS,
	type RollupContext,
	type SidebarRow,
	sectionsOf,
	type Wanting,
	wantingOf,
} from "./sidebar/model.ts";
import { publishPage, usePageData } from "./sidebar/page-data.ts";
import { RollupSheet } from "./sidebar/RollupSheet.tsx";
import { folderName } from "./sidebar/Row.tsx";
import { SidebarView, useNow } from "./sidebar/Sidebar.tsx";

/** Closes the top layer only (a sheet), keeping those below it (a phone's drawer). */
const closeTopLayer = () => void getNavigation().close((route) => ({ ...route, layers: route.layers.slice(0, -1) }));

/** A session without subagents (one value, so its rows keep their identity across renders). */
const NO_SUBAGENTS: readonly Child[] = [];

const subscribeVisibility = (listener: () => void) => {
	document.addEventListener("visibilitychange", listener);
	return () => document.removeEventListener("visibilitychange", listener);
};
/** Whether the page is shown (not a background tab or a hidden app). */
const usePageVisible = () => useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "visible");

/** Rows before the sidebar's "New session", each a list item (`sidebar-start:<name>`, e.g. the Familiar's). */
const startRows = <SlotList prefix="sidebar-start" />;
/** Icon buttons at the footer's end, before the theme switch (`sidebar-actions:<name>`, e.g. the Settings gear). */
const actions = <SlotList prefix="sidebar-actions" />;
/** Icon buttons in the header, before the collapse button (`sidebar-header:<name>`). */
const headerActions = <SlotList prefix="sidebar-header" />;

/** The sidebar's New session: the new-session screen, without the model chosen before. */
const newSession = () => startNewSession();

/** What a row says about a lifecycle operation (`Sessions.operations`), by kind: running, and failed. */
const OPERATION_LABELS: Record<Operation["kind"], { running: string; failed: string }> = {
	relocate: { running: "Moving…", failed: "Move failed" },
	clone: { running: "Cloning…", failed: "Clone failed" },
	fork: { running: "Forking…", failed: "Fork failed" },
	archive: { running: "Archiving…", failed: "Archive failed" },
};

/**
 * The operation row `session` shows: a failed one of it first (with Dismiss), else one running on it, else a copy
 * into it whose files are still being copied (its worker waits for them).
 */
function operationOf(
	operations: readonly Operation[],
	session: string,
	dismiss: (operation: string) => void,
): SidebarRow["operation"] {
	const failed = operations.find((operation) => operation.phase === "failed" && operation.session === session);
	if (failed?.phase === "failed")
		return { label: OPERATION_LABELS[failed.kind].failed, error: failed.error, dismiss: () => dismiss(failed.id) };
	const running = operations.find((operation) => operation.session === session);
	if (running) return { label: OPERATION_LABELS[running.kind].running };
	const copying = operations.find(
		(operation) => operation.phase === "running" && operation.target === session && operation.copying,
	);
	return copying ? { label: "Copying files…" } : undefined;
}

/** A change to one session's row while its call is in flight. */
type RowGuess = { readonly id: string; readonly change: Partial<Session> };
const applyRow = (rows: Session[] | undefined, { id, change }: RowGuess): Session[] | undefined =>
	rows?.map((row) => (row.id === id ? { ...row, ...change } : row));

/** A subagent archived while its call is in flight. */
type ChildGuess = { readonly session: string; readonly conversation: number };
type Children = Readonly<Record<string, readonly Child[]>>;
const applyArchived = (children: Children | undefined, { session, conversation }: ChildGuess): Children | undefined =>
	children && {
		...children,
		[session]: (children[session] ?? []).map((child) =>
			child.conversationId === conversation ? { ...child, archived: true } : child,
		),
	};

/** The owner's sidebar settings (`SidebarSettings`): the rollups' order and windows, collapsed rollups and groups. */
type Settings = {
	readonly order: readonly string[];
	readonly windows: Readonly<Record<string, SidebarWindow>>;
	readonly collapsed: Readonly<Record<string, boolean>>;
};
const applySettings = (state: Settings, change: Partial<Settings>): Settings => ({ ...state, ...change });
const NO_SETTINGS: Settings = { order: [], windows: {}, collapsed: {} };

// What the other sessions want from the owner, for the menu button's badge (`MenuBadge`), which the top bars render
// outside the sidebar; published by the sidebar, which holds the rows. A new value only when it changed.
const wantingListeners = new Set<() => void>();
let wanting: Wanting = { count: 0, failed: false };
const subscribeWanting = (listener: () => void) => {
	wantingListeners.add(listener);
	return () => wantingListeners.delete(listener);
};
function publishWanting(next: Wanting): void {
	if (next.count === wanting.count && next.failed === wanting.failed) return;
	wanting = next;
	for (const listener of wantingListeners) listener();
}

/**
 * The sessions as the sidebar and its list pages show them, and what they act with: the catalog's rows (with a row's
 * edit shown at once), their state (working, unread, failed, an operation), what the rollups collect from (folder names, sandboxes),
 * the owner's settings, opening and restoring a session, and its items' actions (stopping runs, archiving a session or
 * a subagent). Reads use `keptIn`: while the connection is down the rows stay as last seen; actions need the live
 * objects.
 */
function useSidebarData() {
	const route = useRoute();
	const host = useHost();
	const nav = useNavigation();
	const service = useObject(Sessions, {});
	const catalog = liveIn(service, "owner");
	// As the server last said (kept across starts): unread marks and search hold without waiting for Access.
	const owner = useOwner();
	const status = keptIn(useObject(SessionStatus, {}), "reader");
	const agents = keptIn(useObject(Subagents, {}), "reader");
	const { fail, focusWhenOpen } = useComposerState();
	const [list, edit] = useOptimisticCall(useReadable(keptIn(service, "owner", "guest")?.sessions), applyRow, fail);
	const statuses = useReadable(status?.statuses);
	// A subagent's Archive hides it at once; the worker's report follows (or the call fails and it shows again).
	const [children, archiving] = useOptimisticCall(useReadable(agents?.children), applyArchived, fail);
	// Unread answers are the owner's (any device); guests see none and mark nothing.
	const marks = useObject(SessionReads, owner ? {} : undefined);
	const answers = useReadable(marks?.answers);
	const reads = useReadable(marks?.reads);
	// Dismissing a failed operation removes its line at once.
	const [operations, dismissing] = useOptimisticCall(
		useReadable(keptIn(service, "owner")?.operations) ?? [],
		(list, operation: string) => list.filter((each) => each.id !== operation),
		fail,
	);
	const dismiss = useCallback(
		(operation: string) => {
			if (catalog) dismissing(operation, () => catalog.dismissOperation({ operation }, BACKGROUND_CONTEXT));
		},
		[catalog, dismissing],
	);
	const rows = useMemo(
		() =>
			(list ?? []).map((session): SidebarRow => {
				const busy = statuses?.[session.id]?.busy ?? [];
				return {
					...session,
					env: session.env ?? null,
					worker: {
						busy,
						work: statuses?.[session.id]?.work ?? {},
						error: statuses?.[session.id]?.error,
						failure: statuses?.[session.id]?.failure,
						unread: (answers?.[session.id] ?? 0) > (reads?.[session.id] ?? 0),
					},
					subagents: children?.[session.id] ?? NO_SUBAGENTS,
					operation: operationOf(operations, session.id, dismiss),
				};
			}),
		[list, statuses, children, answers, reads, operations, dismiss],
	);
	// Folders on a sandbox environment show a lock; only the owner reads environments.
	const envs = useReadable(useObject(Envs, owner ? {} : undefined)?.envs);
	const context = useMemo(
		(): RollupContext => ({
			folderName,
			sandboxes: new Set((envs ?? []).flatMap((env) => (env.config.type === "gondolin" ? [env.name] : []))),
		}),
		[envs],
	);
	const settingsHeld = useObject(SidebarSettings, owner ? {} : undefined);
	const settingsKept = keptIn(settingsHeld, "owner");
	const order = useReadable(settingsKept?.order);
	const windows = useReadable(settingsKept?.windows);
	const collapsed = useReadable(settingsKept?.collapsed);
	const [settings, guessSettings] = useOptimisticCall<Settings, Partial<Settings>>(
		useMemo(
			() => (order ? { order, windows: windows ?? {}, collapsed: collapsed ?? {} } : NO_SETTINGS),
			[order, windows, collapsed],
		),
		applySettings,
		fail,
	);
	/** Shows `change` at once and calls `call` with the live settings; offline the call fails, rolling it back. */
	const changeSettings = useCallback(
		(change: Partial<Settings>, call: (live: HeldIn<typeof SidebarSettings, "owner">) => Promise<unknown>) =>
			guessSettings(change, async () => {
				const live = liveIn(settingsHeld, "owner");
				if (!live) throw new Error("Not connected");
				await call(live);
			}),
		[guessSettings, settingsHeld],
	);
	const rollups = useMemo(() => arranged(ROLLUPS, settings.order), [settings.order]);
	const now = useNow();
	const view = useMemo(
		() => ({ windows: settings.windows, collapsed: settings.collapsed, now, open: route.session }),
		[settings, now, route.session],
	);
	// A session opens at its main conversation; `/s/<id>` would open conversation 1, which redirects there.
	const targetOf = useCallback(
		(session: string, conversation?: number) => ({
			session,
			conversation: conversation ?? list?.find((each) => each.id === session)?.main ?? 1,
		}),
		[list],
	);
	// The opened composer takes the focus, unless a touch opened it: that would open the keyboard, which a tap on the
	// composer does.
	const onOpen = useCallback(
		(session: string, conversation?: number) => {
			const target = targetOf(session, conversation);
			focusWhenOpen(target);
			navigate(target);
		},
		[targetOf, focusWhenOpen],
	);
	// The restored row is back at once; the session opens once the server has it (an archived one would bounce).
	const onRestore = useCallback(
		(id: string, conversation?: number) => {
			if (!catalog) return;
			const target = targetOf(id, conversation);
			const cancel = focusWhenOpen(target);
			edit({ id, change: { archivedAt: null } }, async () => {
				try {
					await catalog.restore({ id }, BACKGROUND_CONTEXT);
				} catch (error) {
					cancel();
					throw error;
				}
				navigate(target);
			});
		},
		[catalog, edit, targetOf, focusWhenOpen],
	);
	// Who may act on a session's agents: the owner, and a guest with read/write access to it.
	const access = useObject(Access, {});
	const guest = useReadable(keptIn(access, "guest")?.grant);
	const writable = useCallback((session: string) => owner || grantMode(guest, session) === "full", [owner, guest]);
	// An item's Cancel: its runs stop; the inputs they had queued wait as drafts in their conversations.
	const onCancel = useCallback(
		(session: string, conversations: readonly number[]) => void stopRuns(host, session, conversations).catch(fail),
		[host, fail],
	);
	// A session's Archive (the owner's): gone at once, as the Session sheet's Archive; the open one leaves the page.
	const onArchive = useCallback(
		(id: string) =>
			edit({ id, change: { archivedAt: Date.now() } }, async () => {
				if (!catalog) throw new Error("Not connected");
				if (route.session === id) void nav.replace(NEW_SESSION);
				await catalog.archive({ id }, BACKGROUND_CONTEXT);
			}),
		[catalog, route.session, nav, edit],
	);
	const onArchiveAgent = useCallback(
		(session: string, conversation: number) =>
			archiving({ session, conversation }, () => archiveSubagent(host, session, conversation)),
		[archiving, host],
	);
	const searchHeld = useObject(Search, owner ? {} : undefined);
	const search = liveIn(searchHeld, "owner");
	// The owner's lists keep their search field while offline; a search waits for the connection (the page skips it).
	const onSearch = useMemo(
		() =>
			searchHeld &&
			((query: string, archived: boolean, sessions: readonly string[]) => {
				const live = liveIn(searchHeld, "owner");
				if (!live) return Promise.reject(new Error("Not connected"));
				return live.search({ query, archived, sessions: [...sessions] }, BACKGROUND_CONTEXT);
			}),
		[searchHeld],
	);
	return {
		route,
		catalog,
		owner,
		fail,
		list,
		edit,
		rows,
		answers,
		reads,
		marks,
		search,
		onSearch,
		context,
		settings,
		changeSettings,
		rollups,
		view,
		onOpen,
		onRestore,
		guest,
		writable,
		onCancel,
		onArchive: owner ? onArchive : undefined,
		onArchiveAgent,
	};
}

/**
 * The sidebar, and the owner's actions on it: the session actions (rename, pin, archive and restore: the Session sheet
 * is rendered here, opened from the top bar's button), renaming a `/tree` branch (its sheet; the tree panel's command
 * menu opens it), a group's "+", a rollup's options and collapsing rollups and groups. Each action shows
 * its effect at once (`useOptimisticCall`); a refused one rolls back and the toast says why.
 */
function Sidebar() {
	const connected = useConnected();
	const nav = useNavigation();
	const data = useSidebarData();
	const { route, catalog, owner, fail, list, edit, rows, answers, reads, marks, search, settings, changeSettings } =
		data;
	const { rollups, context, view, onOpen, onRestore, guest } = data;
	// Sessions a plugin's sidebar entry shows (the Familiar's, a `sidebar-start` row) are left out of the rollups.
	const [apart, setApart] = useState<Readonly<Record<string, readonly string[]>>>({});
	const listApart = useCallback(
		(key: string, ids: readonly string[]) => setApart((current) => ({ ...current, [key]: ids })),
		[],
	);
	const drawerRows = useMemo<DrawerRows>(() => ({ sessions: rows, listApart }), [rows, listApart]);
	const rolledUp = useMemo(() => {
		const hidden = new Set(Object.values(apart).flat());
		return hidden.size ? rows.filter((row) => !hidden.has(row.id)) : rows;
	}, [rows, apart]);
	const { onSearch, writable, onCancel, onArchive, onArchiveAgent } = data;
	const sections = useMemo(() => sectionsOf(rollups, rolledUp, context, view), [rollups, rolledUp, context, view]);
	useEffect(() => {
		if (list) rememberMains(list);
	}, [list]);
	// The open session's main conversation, shown on a visible page, is read through its latest answer.
	const visible = usePageVisible();
	const viewed = list?.find((session) => session.id === route.session);
	const shown = visible && route.conversation === viewed?.main ? route.session : undefined;
	const latest = shown ? (answers?.[shown] ?? 0) : 0;
	const read = shown ? (reads?.[shown] ?? 0) : 0;
	useEffect(() => {
		if (shown && marks && latest > read)
			void marks.markRead({ session: shown, through: latest }, BACKGROUND_CONTEXT).catch(() => {});
	}, [marks, shown, latest, read]);
	// A rebuild shows as running at once; it is long work (a job), so the sheet shows it running until it is done.
	const [rebuilds, reindex] = useOptimisticCall(
		useReadable(search?.rebuilds) ?? [],
		(list, session: string) => [
			...list.filter((each) => each.session !== session),
			{ session, phase: "running" as const },
		],
		fail,
	);
	const sessionSheet = useSheet("session");
	/** A group's "+": a new session in the group's folder. */
	const onNewIn = useCallback(
		(target: NewTarget) => startNewSession({ location: { env: target.env, cwd: target.cwd } }),
		[],
	);
	const onCollapse = useCallback(
		(key: string, collapsed: boolean) =>
			changeSettings({ collapsed: { ...settings.collapsed, [key]: collapsed } }, (live) =>
				live.setCollapsed({ key, collapsed }, BACKGROUND_CONTEXT),
			),
		[changeSettings, settings.collapsed],
	);
	const onOptions = useCallback(
		(key: string) => openLayer({ kind: "sheet", name: "sidebar-rollup", locator: key }, { fromDrawer: true }),
		[],
	);
	const ownerNewIn = owner ? onNewIn : undefined;
	useEffect(() => publishWanting(wantingOf(rows, route.session)), [rows, route.session]);
	useEffect(
		() =>
			publishPage({
				rows: rolledUp,
				rollups,
				context,
				view,
				loading: !list,
				connected,
				onOpen,
				onRestore,
				writable,
				onCancel,
				...(onArchive ? { onArchive } : {}),
				onArchiveAgent,
				...(onSearch ? { onSearch } : {}),
				...(ownerNewIn ? { onNewIn: ownerNewIn } : {}),
			}),
		[
			rolledUp,
			rollups,
			context,
			view,
			list,
			connected,
			onOpen,
			onRestore,
			writable,
			onCancel,
			onArchive,
			onArchiveAgent,
			onSearch,
			ownerNewIn,
		],
	);
	const rollupSheet = useSheet("sidebar-rollup");
	const optionsOf = rollupSheet && sections.find((section) => section.key === rollupSheet.locator);
	/** A rollup's options: its window, and moving it among the rollups with a heading (one without stays first). */
	const rollupActions = (key: string) => {
		const ordering = movable(rollups);
		const at = ordering.findIndex((rollup) => rollup.key === key);
		const move = (by: -1 | 1) => () => {
			const order = moved(ordering, key, by);
			changeSettings({ order }, (live) => live.setOrder({ order }, BACKGROUND_CONTEXT));
		};
		return {
			onWindow: (window: SidebarWindow) =>
				changeSettings({ windows: { ...settings.windows, [key]: window } }, (live) =>
					live.setWindow({ key, window }, BACKGROUND_CONTEXT),
				),
			onMove: {
				...(at > 0 ? { up: move(-1) } : {}),
				...(at >= 0 && at < ordering.length - 1 ? { down: move(1) } : {}),
			},
		};
	};
	return (
		<DrawerRowsContext.Provider value={drawerRows}>
			<SidebarView
				rows={rows}
				sections={sections}
				now={view.now}
				page={route.page}
				newSession={route.newSession === true}
				startRows={startRows}
				guest={guest}
				activeId={route.session}
				conversationId={route.conversation}
				connected={connected}
				onOpen={onOpen}
				onRestore={onRestore}
				writable={writable}
				onCancel={onCancel}
				onArchive={onArchive}
				onArchiveAgent={onArchiveAgent}
				onNew={newSession}
				onNewIn={ownerNewIn}
				onOptions={owner ? onOptions : undefined}
				onCollapse={owner ? onCollapse : undefined}
				onPage={openPage}
				onCollapseSidebar={toggleSidebar}
				headerActions={headerActions}
				footerActions={actions}
			/>
			{optionsOf && (
				<RollupSheet
					key={optionsOf.key}
					section={optionsOf}
					{...rollupActions(optionsOf.key)}
					onClose={closeLayers}
				/>
			)}
			{sessionSheet && catalog && viewed && route.conversation === viewed.main && (
				<SessionSheet
					session={viewed}
					onClose={closeLayers}
					onRename={(title) =>
						edit({ id: viewed.id, change: { title } }, () =>
							catalog.rename({ id: viewed.id, title }, BACKGROUND_CONTEXT),
						)
					}
					onPin={() =>
						edit({ id: viewed.id, change: { pinned: !viewed.pinned } }, () =>
							catalog.pin({ id: viewed.id, pinned: !viewed.pinned }, BACKGROUND_CONTEXT),
						)
					}
					onShare={() => openLayer({ kind: "sheet", name: "share" })}
					onCwd={() => openLayer(directoryPickerLayer(viewed.env ?? null, viewed.cwd))}
					reindex={rebuilds.find((each) => each.session === viewed.id)}
					onReindex={
						search &&
						(() => reindex(viewed.id, () => search.rebuildIndex({ session: viewed.id }, BACKGROUND_CONTEXT)))
					}
					onArchive={() => {
						closeLayers();
						void nav.replace(NEW_SESSION);
						edit({ id: viewed.id, change: { archivedAt: Date.now() } }, () =>
							catalog.archive({ id: viewed.id }, BACKGROUND_CONTEXT),
						);
					}}
				/>
			)}
		</DrawerRowsContext.Provider>
	);
}

/** A rollup's or a group's list in the main area (`Route.page`), from the sidebar's data (`publishPage`). */
function SectionPage() {
	const route = useRoute();
	const data = usePageData();
	const page = route.page;
	const list = useMemo(
		() => data && page !== undefined && listPageOf(page, data.rollups, data.rows, data.context, data.view),
		[data, page],
	);
	if (!data || page === undefined) return null;
	return (
		<ListPage
			key={page}
			page={page}
			data={list || undefined}
			loading={data.loading}
			connected={data.connected}
			actions={{
				conversationId: route.conversation,
				now: data.view.now,
				onOpen: data.onOpen,
				onRestore: data.onRestore,
				writable: data.writable,
				onCancel: data.onCancel,
				...(data.onArchive ? { onArchive: data.onArchive } : {}),
				onArchiveAgent: data.onArchiveAgent,
			}}
			{...(data.onSearch ? { onSearch: data.onSearch } : {})}
			{...(data.onNewIn ? { onNewIn: data.onNewIn } : {})}
		/>
	);
}

/**
 * The menu button's badge (the `menu-badge` slot): how many other sessions want the owner (a failure or an unread
 * answer), in the error colour when one failed, else the unread blue. Steady: only working moves in the sidebar.
 */
function MenuBadge() {
	const { count, failed } = useSyncExternalStore(subscribeWanting, () => wanting);
	if (count === 0) return null;
	return (
		<span
			className={`menu-badge ${failed ? "failed" : ""}`}
			title={failed ? `${count} want you, a failure among them` : `${count} with a new answer`}
		>
			{count}
		</span>
	);
}

/** The top bar's button that opens the Session sheet (the drawer renders the sheet, where the rows are). */
function SessionOptions() {
	const route = useRoute();
	const rows = useReadable(useObject(Sessions, {}, { variant: "owner" })?.sessions);
	const session = rows?.find((row) => row.id === route.session);
	if (!session || route.conversation !== session.main) return null;
	return (
		<button
			type="button"
			className="icon-button"
			aria-label="Session options"
			onClick={() => openLayer({ kind: "sheet", name: "session" })}
		>
			<MoreIcon />
		</button>
	);
}

export default defineFacet((host) => {
	contribute(host, "p2.web-sessions", (self) => {
		self.contribute(Slots, {
			sidebar: Sidebar,
			page: SectionPage,
			"session-options": SessionOptions,
			"menu-badge": MenuBadge,
		});
		self.contribute(Commands, SESSION_COMMANDS);
		self.contribute(CommandPages, SESSION_PAGES);
		self.contribute(CommandSearches, { sessions: SESSION_SEARCH });
	});
});
