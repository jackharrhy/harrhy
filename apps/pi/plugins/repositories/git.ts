// Read-only local Git observations. NUL-delimited paths never leave status counting.
import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import type { Association, Located, Observation, Tree, TreeStatus } from "./contract.ts";

const execute = promisify(execFile);

/** Executes Git without a shell, optional locks, prompts or remote access. */
export async function git(cwd: string, args: string[], signal: AbortSignal): Promise<string> {
	const result = await execute("git", ["--no-optional-locks", "-C", cwd, ...args], {
		encoding: "utf8",
		signal,
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});
	return result.stdout;
}

/** Expands only the local home notation and resolves the selected existing seed. */
export async function localPath(cwd: string): Promise<string> {
	const path = cwd === "~" ? homedir() : cwd.startsWith("~/") ? resolve(homedir(), cwd.slice(2)) : cwd;
	if (!isAbsolute(path)) throw new Error("Unresolved location: an absolute path is required");
	return realpath(path);
}

/** Resolves Git's common-directory identity without interpreting branch or remote names as identity. */
export async function commonDirectory(cwd: string, signal: AbortSignal): Promise<string> {
	return localPath(
		(await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], signal)).replace(/\n$/, ""),
	);
}

/** Parses Git's porcelain-z registration records, retaining locked, missing, bare and detached entries. */
export function parseTrees(output: string): Tree[] {
	if (!output.endsWith("\0\0")) throw new Error("Malformed Git worktree output");
	return output
		.slice(0, -2)
		.split("\0\0")
		.map((record) => {
			const fields = record.split("\0");
			const first = fields.shift();
			if (!first?.startsWith("worktree ")) throw new Error("Malformed Git worktree record");
			const tree: Tree = { path: first.slice(9), head: "", branch: "", bare: false, detached: false };
			for (const field of fields) {
				const space = field.indexOf(" ");
				const key = space < 0 ? field : field.slice(0, space);
				const value = space < 0 ? "" : field.slice(space + 1);
				if (key === "HEAD") tree.head = value;
				else if (key === "branch") tree.branch = value.replace(/^refs\/heads\//, "");
				else if (key === "bare") tree.bare = true;
				else if (key === "detached") tree.detached = true;
				else if (key === "locked") tree.locked = value;
				else if (key === "prunable") tree.prunable = value;
				else throw new Error("Malformed Git worktree field");
			}
			return tree;
		});
}

/** Reads registrations for one resolved common directory. */
export async function readRepository(cwd: string, common: string, signal: AbortSignal): Promise<Observation> {
	return {
		common,
		checked: Date.now(),
		trees: await Promise.all(
			parseTrees(await git(cwd, ["worktree", "list", "--porcelain", "-z"], signal)).map(async (tree) => {
				try {
					const info = await stat(tree.path);
					return { ...tree, presence: info.isDirectory() ? ("existing" as const) : ("unavailable" as const) };
				} catch (error) {
					// Filesystem observation boundary: absence differs from denied or unavailable metadata.
					return {
						...tree,
						presence:
							error instanceof Error && "code" in error && error.code === "ENOENT"
								? ("missing" as const)
								: ("unavailable" as const),
					};
				}
			}),
		),
	};
}

/** Resolves reported conversation locations without turning containment into task ownership. */
export async function associateLocations(
	locations: readonly Located[],
	trees: readonly Tree[],
	common: string,
	signal: AbortSignal,
): Promise<Association[]> {
	const matches = await associateDirectories(locations, trees, common, signal);
	return locations
		.filter((location) => location.env === null)
		.map((location) => ({
			// Every local input has a result, including unresolved paths.
			...matches.find((match) => match.cwd === location.cwd)!,
			session: location.session,
			conversation: location.conversation,
		}));
}

/** Resolves only known local directories and registrations; missing or ambiguous paths remain unknown. */
export async function associateDirectories(
	locations: readonly { env: string | null; cwd: string }[],
	trees: readonly Tree[],
	common: string,
	signal: AbortSignal,
): Promise<Pick<Association, "cwd" | "tree" | "qualification">[]> {
	const paths = new Map<string, Promise<string | undefined>>();
	const identities = new Map<string, Promise<string | undefined>>();
	const resolved = (path: string) => {
		let pending = paths.get(path);
		if (!pending) {
			// Missing and unresolvable known paths are evidence gaps, not discovery failures or unused trees.
			pending = localPath(path).catch(() => undefined);
			paths.set(path, pending);
		}
		return pending;
	};
	const registrations = await Promise.all(
		trees.map(async (tree) => ({ path: tree.path, resolved: await resolved(tree.path) })),
	);
	return Promise.all(
		locations
			.filter((location) => location.env === null)
			.map(async (location) => {
				signal.throwIfAborted();
				const cwd = await resolved(location.cwd);
				signal.throwIfAborted();
				const matching = cwd
					? registrations
							.filter(
								(tree) =>
									tree.resolved &&
									(cwd === tree.resolved ||
										cwd.startsWith(tree.resolved.endsWith("/") ? tree.resolved : `${tree.resolved}/`)),
							)
							.sort((a, b) => b.resolved!.length - a.resolved!.length)
					: [];
				const first = matching[0];
				const ambiguous = first && matching[1]?.resolved === first.resolved;
				let identity: string | undefined;
				if (cwd && first && !ambiguous) {
					let pending = identities.get(cwd);
					if (!pending) {
						// Containment alone would incorrectly assign a different nested Git repository to its parent.
						pending = commonDirectory(cwd, signal).catch(() => undefined);
						identities.set(cwd, pending);
					}
					identity = await pending;
				}
				signal.throwIfAborted();
				return {
					cwd: location.cwd,
					tree: first && !ambiguous && identity === common ? first.path : null,
					qualification: !cwd
						? "Location could not be resolved"
						: ambiguous
							? "Ambiguous registered paths"
							: !first
								? "Outside observed registered trees"
								: identity === undefined
									? "Git identity could not be checked"
									: identity !== common
										? "Different nested repository"
										: cwd !== location.cwd
											? "Resolved through a different path"
											: "Resolved directory",
				};
			}),
	);
}

/** Counts porcelain entries, consuming rename/copy source records without retaining filenames. */
export function countStatus(output: string): { tracked: number; untracked: number } {
	let tracked = 0;
	let untracked = 0;
	const records = output.split("\0");
	if (records.pop() !== "") throw new Error("Malformed Git status output");
	for (let i = 0; i < records.length; i++) {
		const entry = records[i]!;
		if (entry.length < 4 || entry[2] !== " ") throw new Error("Malformed Git status entry");
		if (entry.startsWith("?? ")) untracked++;
		else {
			tracked++;
			if (/[RC]/.test(entry.slice(0, 2)) && records[++i] === undefined)
				throw new Error("Malformed Git rename entry");
		}
	}
	return { tracked, untracked };
}

/** Reads only counts for an explicitly requested registered working tree. */
export async function readStatus(cwd: string, signal: AbortSignal): Promise<TreeStatus> {
	return {
		...countStatus(await git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"], signal)),
		checked: Date.now(),
		failure: null,
	};
}
