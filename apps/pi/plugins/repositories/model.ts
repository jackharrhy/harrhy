// The three work-context projections share identities and evidence, never guessed preview ownership.
import type { Session } from "../sessions/contract.ts";
import type { ContextRead, Located, Preview, Tree } from "./contract.ts";

export type Worktree = { id: string; common: string; repository: string; tree: Tree };

/** Registered trees are identified by resolved common directory plus registered path, never branch or project title. */
export function worktreesOf(context: ContextRead | undefined): Worktree[] {
	return (
		context?.repositories.flatMap((repository) => {
			const primary = repository.trees[0]?.path ?? repository.common;
			const name =
				primary
					.replace(/[\\/]+$/, "")
					.split(/[\\/]/)
					.at(-1) ?? primary;
			return repository.trees.map((tree) => ({
				id: JSON.stringify([repository.common, tree.path]),
				common: repository.common,
				repository: name,
				tree,
			}));
		}) ?? []
	);
}

/** Only currently matching location evidence is shown as a conversation's resolved working-tree association. */
export function locationsForTree(
	worktree: Worktree,
	locations: readonly Located[],
	context: ContextRead | undefined,
): Located[] {
	return locations.filter(
		(location) =>
			location.env === null &&
			context?.associations.some(
				(match) =>
					match.common === worktree.common &&
					match.tree === worktree.tree.path &&
					match.session === location.session &&
					match.conversation === location.conversation &&
					match.cwd === location.cwd,
			),
	);
}

export type LocationGroup = { id: string; worktree?: Worktree; locations: Located[] };

/** Groups only resolved canonical tree identities; unresolved locations stay qualified by their reported environment/path. */
export function locationGroups(locations: readonly Located[], context: ContextRead | undefined): LocationGroup[] {
	const trees = worktreesOf(context);
	const groups = new Map<string, LocationGroup>();
	for (const location of locations) {
		const worktree = trees.find((tree) => locationsForTree(tree, [location], context).length > 0);
		const id = worktree?.id ?? JSON.stringify(["unresolved", location.env, location.cwd]);
		let group = groups.get(id);
		if (!group) {
			group = { id, worktree, locations: [] };
			groups.set(id, group);
		}
		group.locations.push(location);
	}
	return [...groups.values()];
}

/** The newest supplied activity event, never a filesystem or metadata-fetch time. */
export function latestActivity(locations: readonly Located[]): number | undefined {
	const times = locations.flatMap((location) => (location.updatedAt === undefined ? [] : [location.updatedAt]));
	return times.length ? Math.max(...times) : undefined;
}

/** A preview joins a tree only through its explicit served-location evidence and the resolver, not its opening session. */
export function previewsForTree(
	worktree: Worktree,
	previews: readonly Preview[],
	context: ContextRead | undefined,
): Preview[] {
	return previews.filter(
		(preview) =>
			preview.location?.env === null &&
			context?.previewTrees.some(
				(match) =>
					match.cwd === preview.location?.cwd &&
					match.preview === preview.id &&
					match.common === worktree.common &&
					match.tree === worktree.tree.path,
			),
	);
}

/** Session links and explicit tree context are separate ways a preview can be relevant to a session. */
export function previewsForSession(
	session: string,
	locations: readonly Located[],
	previews: readonly Preview[],
	context: ContextRead | undefined,
): Preview[] {
	const trees = worktreesOf(context).filter((tree) =>
		locationsForTree(tree, locations, context).some((location) => location.session === session),
	);
	return previews.filter(
		(preview) =>
			preview.session === session || trees.some((tree) => previewsForTree(tree, [preview], context).length > 0),
	);
}

/** Activity describes the session's reported conversations, independently of repository or preview state. */
export function sessionActivity(session: string, locations: readonly Located[]): string {
	const rows = locations.filter((location) => location.session === session && !location.archived);
	return rows.some((row) => row.activity === "Working")
		? "Working"
		: rows.some((row) => row.activity === "Failed")
			? "Failed"
			: rows.some((row) => row.activity === "Idle")
				? "Idle"
				: "Stopped";
}

/** A filter reads only supplied metadata; it never searches content, processes or the filesystem. */
export function sessionMatches(
	session: Session,
	locations: readonly Located[],
	previews: readonly Preview[],
	query: string,
): boolean {
	return [
		session.title,
		...locations.filter((location) => location.session === session.id).map((location) => location.cwd),
		...previews
			.filter((preview) => preview.session === session.id)
			.flatMap((preview) => [preview.name, preview.url ?? ""]),
	]
		.join(" ")
		.toLowerCase()
		.includes(query.toLowerCase());
}

/** Lease expiry says nothing about health or process lifetime; unknown expiry remains unknown. */
export function previewState(preview: Preview, now: number): string {
	return preview.lease.kind === "expires" && preview.lease.at <= now ? "Expired" : "";
}
