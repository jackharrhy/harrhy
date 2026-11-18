// Owner-only known locations and process-local Git observations. Mounting/subscribing never invokes Git.
import { type Ctx, defineFacet, deriveTyped, forbidden, isOwner, signalOf } from "@p2/app/v1";
import { Server } from "@p2/app/v1/server";
import { ForwardStore } from "../ports/contract.ts";
import { ProjectService } from "../projects/contract.ts";
import { Catalog } from "../sessions/contract.ts";
import { type Status, StatusStore } from "../status/contract.ts";
import { ChildStore } from "../subagents/contract.ts";
import { ReadCache } from "./cache.ts";
import {
	type Association,
	type ContextRead,
	type Located,
	type Observation,
	type PreviewRead,
	Repositories,
	type RepositoryRead,
	type Seed,
	type TreeStatus,
} from "./contract.ts";
import {
	associateDirectories,
	associateLocations,
	commonDirectory,
	localPath,
	readRepository,
	readStatus,
} from "./git.ts";
import { readPreviews } from "./previews.ts";

export default defineFacet((host) => {
	// The facet lifetime bounds these observations; nothing is persisted or shared with workers.
	const observations = new ReadCache<Observation>();
	const statuses = new ReadCache<TreeStatus>();
	const associations = new ReadCache<Association[]>();
	const directories = new ReadCache<Pick<Association, "cwd" | "tree" | "qualification">[]>();
	const previewMetadata = new ReadCache<PreviewRead>();
	host.serve(
		Repositories,
		(_params, principal, self) => {
			const authorize = () => {
				if (!isOwner(principal)) throw forbidden("repositories are owner-only");
			};
			authorize();
			const catalog = self.get(Catalog, {});
			const server = self.get(Server, {});
			const forwards = self.get(ForwardStore, {});
			const projects = self.get(ProjectService, {});
			const children = self.get(ChildStore, {});
			const statusStore = self.get(StatusStore, {});
			const locations = deriveTyped(
				self,
				[catalog.sessions, children.children, statusStore.statuses],
				([sessions, bySession, statuses]): Located[] =>
					sessions.flatMap((session) => [
						...[...new Set([session.main, ...session.branches.map((branch) => branch.conversation)])].map(
							(conversation) => ({
								session: session.id,
								conversation,
								title:
									session.branches.find((branch) => branch.conversation === conversation)?.label ??
									session.title,
								env: session.env ?? null,
								cwd: session.cwd,
								archived: session.archivedAt !== null,
								activity: activity(statuses[session.id], conversation),
								kind: conversation === session.main ? ("session" as const) : ("branch" as const),
							}),
						),
						...(bySession[session.id] ?? []).map((child) => ({
							session: session.id,
							conversation: child.conversationId,
							title: child.name,
							env: child.location ? child.location.env : (session.env ?? null),
							cwd: child.location?.cwd ?? session.cwd,
							archived: session.archivedAt !== null || (child.archived ?? false),
							activity: statuses[session.id]?.busy.includes(child.conversationId)
								? "Working"
								: child.failure
									? "Failed"
									: "Recorded",
							kind: "child" as const,
							...(child.updatedAt === undefined ? {} : { updatedAt: child.updatedAt }),
						})),
					]),
			);
			const seeds = deriveTyped(self, [locations, projects.projects], ([located, configured]): Seed[] => {
				const result = new Map<string, Seed>();
				const add = (env: string | null, cwd: string, label: string) => {
					const id = JSON.stringify([env, cwd]);
					if (!result.has(id)) result.set(id, { id, env, cwd, label });
				};
				for (const project of configured)
					for (const place of project.places) add(place.env, place.path, project.name);
				for (const location of located) add(location.env, location.cwd, location.title);
				return [...result.values()];
			});
			const selected = (id: string) => {
				authorize();
				const seed = seeds.value.find((seed) => seed.id === id);
				if (!seed) throw forbidden("location is no longer known");
				if (seed.env !== null) throw new Error("Remote inspection unavailable — not checked");
				return seed;
			};
			const known = new ReadCache<Observation>();
			const readLocation = async (
				seed: Seed,
				refresh: Set<string> | undefined,
				ctx: Ctx,
			): Promise<RepositoryRead> => {
				const id = seed.id;

				try {
					const cwd = await localPath(seed.cwd);
					const common = await commonDirectory(cwd, signalOf(ctx));
					const data = await observations.read(
						common,
						refresh && !refresh.has(common) ? "refresh" : "reuse",
						(signal) => readRepository(cwd, common, signal),
						ctx,
					);
					refresh?.add(common);
					known.remember(id, data);
					return { data, failure: null };
				} catch (error) {
					return {
						data: known.peek(id) ?? null,
						failure: signalOf(ctx).aborted
							? "Cancelled"
							: error instanceof Error
								? error.message
								: "Git read failed",
					};
				}
			};
			const previews = async (refresh: boolean, ctx: Ctx): Promise<PreviewRead> => {
				authorize();
				try {
					return await previewMetadata.read(
						"metadata",
						refresh ? "refresh" : "reuse",
						() => readPreviews(server.info.value.dataDir, forwards.list.value),
						ctx,
					);
				} catch (error) {
					const previous = previewMetadata.peek("metadata");
					return {
						checked: previous?.checked ?? Date.now(),
						items: previous?.items ?? [],
						failures: [error instanceof Error ? error.message : "Preview metadata unavailable"],
					};
				}
			};

			return {
				variant: "owner",
				members: {
					seeds,
					locations,
					inspect: ({ seed: id, refresh }, ctx) =>
						readLocation(selected(id), refresh ? new Set() : undefined, ctx),
					associate: async ({ seed: id }, ctx) => {
						selected(id);
						const data = known.peek(id);
						if (!data) throw forbidden("repository was not observed for this location");
						const located = locations.value;
						const key = JSON.stringify([
							data.common,
							data.checked,
							located.map(({ session, conversation, env, cwd }) => [session, conversation, env, cwd]),
						]);
						return associations.read(
							key,
							"reuse",
							(signal) => associateLocations(located, data.trees, data.common, signal),
							ctx,
						);
					},
					previews: ({ refresh }, ctx) => previews(refresh, ctx),
					context: async ({ scope, refresh }, ctx) => {
						authorize();
						const metadata = await previews(refresh, ctx);
						let requested: Seed[];
						if (scope.kind === "session") {
							if (!catalog.sessions.value.some((session) => session.id === scope.id))
								throw forbidden("session is no longer known");
							const ids = new Set(
								locations.value
									.filter((location) => location.session === scope.id)
									.map((location) => JSON.stringify([location.env, location.cwd])),
							);
							requested = seeds.value.filter((seed) => ids.has(seed.id));
						} else if (scope.kind === "preview") {
							const preview = metadata.items.find((preview) => preview.id === scope.id);
							if (!preview) throw forbidden("preview is no longer known");
							requested = preview.location
								? [
										{
											id: JSON.stringify([preview.location.env, preview.location.cwd]),
											env: preview.location.env,
											cwd: preview.location.cwd,
											label: preview.name,
										},
									]
								: [];
						} else {
							requested = [...seeds.value];
							for (const preview of metadata.items)
								if (
									preview.location &&
									!requested.some(
										(seed) => seed.env === preview.location!.env && seed.cwd === preview.location!.cwd,
									)
								)
									requested.push({
										id: JSON.stringify([preview.location.env, preview.location.cwd]),
										env: preview.location.env,
										cwd: preview.location.cwd,
										label: preview.name,
									});
						}
						const result: ContextRead = { repositories: [], associations: [], previewTrees: [], failures: [] };
						const observed = new Set<string>();
						const refreshed = refresh ? new Set<string>() : undefined;
						for (const seed of requested) {
							signalOf(ctx).throwIfAborted();
							if (seed.env !== null) {
								result.failures.push({
									location: seed.cwd,
									error: "Remote inspection unavailable — not checked",
								});
								continue;
							}
							const read = await readLocation(seed, refreshed, ctx);
							if (read.failure) result.failures.push({ location: seed.cwd, error: read.failure });
							const data = read.data;
							if (!data || observed.has(data.common)) continue;
							observed.add(data.common);
							result.repositories.push(data);

							const located = locations.value.filter((location) => location.env === null);
							const declared = metadata.items.filter((preview) => preview.location?.env === null);
							const paths = [
								...located.map(({ env, cwd }) => ({ env, cwd })),
								...declared.flatMap((preview) => (preview.location ? [preview.location] : [])),
							];
							const key = JSON.stringify([data.common, data.checked, paths]);
							const matches = await directories.read(
								key,
								"reuse",
								(signal) => associateDirectories(paths, data.trees, data.common, signal),
								ctx,
							);
							result.associations.push(
								...located.map((location) => ({
									...matches.find((match) => match.cwd === location.cwd)!,
									session: location.session,
									conversation: location.conversation,
									common: data.common,
								})),
							);
							result.previewTrees.push(
								...declared.map((preview) => {
									const match = matches.find((match) => match.cwd === preview.location!.cwd)!;
									return {
										preview: preview.id,
										cwd: preview.location!.cwd,
										common: data.common,
										tree: match.tree,
										qualification: match.qualification,
									};
								}),
							);
						}
						return result;
					},

					status: async ({ seed: id, tree }, ctx) => {
						selected(id);
						if (!known.peek(id)?.trees.some((entry) => entry.path === tree && !entry.bare))
							throw forbidden("working tree was not observed for this location");
						const common = known.peek(id)!.common;
						const key = JSON.stringify([common, tree]);
						try {
							return await statuses.read(
								key,
								"refresh",
								async (signal) => {
									if ((await commonDirectory(tree, signal)) !== common)
										throw new Error("Registered path now names another repository. Refresh the location.");
									return readStatus(tree, signal);
								},
								ctx,
							);
						} catch (error) {
							return {
								...(statuses.peek(key) ?? { checked: Date.now(), tracked: 0, untracked: 0 }),
								failure: signalOf(ctx).aborted
									? "Cancelled"
									: error instanceof Error
										? error.message
										: "Status read failed",
							};
						}
					},
				},
			};
		},
		{
			accepts: {
				1: {
					state: { owner: { locations: (rows) => rows.map(({ updatedAt: _time, kind: _kind, ...row }) => row) } },
				},
				2: {
					state: { owner: { locations: (rows) => rows.map(({ updatedAt: _time, kind: _kind, ...row }) => row) } },
					methods: {
						context: {
							result: (value) => ({
								...value,
								repositories: value.repositories.map((repository) => ({
									...repository,
									trees: repository.trees.map(({ presence: _presence, ...tree }) => tree),
								})),
							}),
						},
						previews: {
							result: (value) => ({
								...value,
								items: value.items.map(({ event: _event, ...preview }) => preview),
							}),
						},
					},
				},
			},
		},
	);
});

function activity(status: Status | undefined, conversation: number): string {
	return status?.error !== undefined
		? "Failed"
		: status?.busy.includes(conversation)
			? "Working"
			: status?.running
				? "Idle"
				: "Stopped";
}
