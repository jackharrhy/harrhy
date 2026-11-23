import type {
	ExecutionEnv,
	FileError,
	FileInfo,
	FileWatcher,
	Result,
	WatchTarget,
} from "@earendil-works/pi-durable/env";
import type { Context } from "@p2/app/v1";
import { withCancel } from "@p2/app/v1";
import { type WorkspaceEntry, type WorkspaceQuery, type WorkspaceResult, workspacePath } from "./protocol.ts";

const LIST_LIMIT = 2000;
const GIT_TIMEOUT = 10_000;
const FILES_LIMIT = 50_000;
const FILES_BYTES = 4 * 1024 * 1024;
const WALK_DIRECTORIES = 5000;
/** Entries the walk reads from one directory; beyond it the directory is cut in its own (unsorted) order. */
const WALK_DIRECTORY_ENTRIES = 2 * FILES_LIMIT;
/**
 * Most directories the working tree's watch covers. Every change rescans the whole watched tree (and on Linux each
 * directory is one watch), so a larger tree, such as a home folder, gets only its root's own entries watched.
 */
const WATCH_DIRECTORIES = 2000;
/** Folders the working tree's watch skips at any depth. */
const WATCH_EXCLUDED = [".git", "node_modules"];

// Read-only, bounded listings of one execution environment's working directory. Every
// file operation and git command goes through the environment, never this process's
// filesystem, so a remote environment works unchanged. Canonical confinement filters
// accidental escapes (symlinked directories); it is not a security boundary against
// a hostile environment, which owners and read/write guests can already command.

export class Workspace {
	readonly env: ExecutionEnv;
	private root?: string;

	constructor(env: ExecutionEnv) {
		this.env = env;
	}

	private async canonicalRoot(context: Context): Promise<string> {
		if (this.root) return this.root;
		const result = await this.env.canonicalPath(this.env.cwd, context);
		if (!result.ok) throw new Error(`Working directory unavailable: ${result.error.code}`);
		this.root = result.value.replace(/\/+$/, "") || "/";
		return this.root;
	}

	/** The absolute environment path of a validated relative path, not yet checked to stay inside the root. */
	private async absolute(path: string, context: Context): Promise<string> {
		const relative = workspacePath(path);
		if (relative === undefined) throw new Error("Invalid workspace path");
		const root = await this.canonicalRoot(context);
		return relative ? `${root === "/" ? "" : root}/${relative}` : root;
	}

	/**
	 * Open `path` while checking that it stays inside the root, in parallel: a remote environment pays one round trip for
	 * both. Nothing opened is used before the check passed; an opened handle of a refused path is closed.
	 */
	private async openConfined<T extends { close(context: Context): Promise<void> }>(
		path: string,
		open: (absolute: string) => Promise<Result<T, FileError>>,
		context: Context,
	): Promise<{ absolute: string; opened: Result<T, FileError> }> {
		const absolute = await this.absolute(path, context);
		const [confined, opened] = await Promise.allSettled([this.confine(absolute, context), open(absolute)]);
		if (confined.status === "rejected") {
			if (opened.status === "fulfilled" && opened.value.ok) void opened.value.value.close(context);
			throw confined.reason;
		}
		if (opened.status === "rejected") throw opened.reason;
		return { absolute, opened: opened.value };
	}

	private async confine(absolute: string, context: Context): Promise<void> {
		const root = await this.canonicalRoot(context);
		const canonical = await this.env.canonicalPath(absolute, context);
		if (!canonical.ok) throw new Error(canonical.error.code === "not_found" ? "File not found" : "Cannot open path");
		const inside = (base: string, value: string) =>
			value === base || value.startsWith(base === "/" ? "/" : `${base}/`);
		if (!inside(root, canonical.value)) throw new Error("Path leaves the working directory");
	}

	/** Every query but `place`, which the worker answers (where it opened this workspace). */
	/** The queries the file index uses: a folder's entries and every file's path. */
	async query(query: WorkspaceQuery, context: Context): Promise<WorkspaceResult> {
		switch (query.kind) {
			case "list":
				return this.list(query.path, context);
			case "files":
				return this.files(context);
		}
	}

	private async list(path: string, context: Context): Promise<WorkspaceResult> {
		const { opened } = await this.openConfined(
			path,
			(directory) => this.env.openDirReader(directory, context),
			context,
		);
		if (!opened.ok)
			throw new Error(opened.error.code === "not_directory" ? "Not a directory" : "Cannot list directory");
		const entries: WorkspaceEntry[] = [];
		let truncated = false;
		try {
			for (;;) {
				const page = await opened.value.next(Math.min(500, LIST_LIMIT + 1 - entries.length), context);
				if (!page.ok) throw new Error("Cannot list directory");
				for (const entry of page.value.entries) {
					if (!path && entry.name === ".git") continue;
					entries.push({ name: entry.name, kind: entry.kind, size: entry.size, mtimeMs: entry.mtimeMs });
				}
				if (entries.length > LIST_LIMIT) {
					truncated = true;
					entries.length = LIST_LIMIT;
					break;
				}
				if (page.value.done) break;
			}
		} finally {
			// Nothing waits for the close: it costs a remote environment a round trip.
			void opened.value.close(context);
		}
		entries.sort(
			(a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || a.name.localeCompare(b.name),
		);
		return { kind: "list", path, entries, truncated };
	}

	private async files(context: Context): Promise<WorkspaceResult> {
		const root = await this.canonicalRoot(context);
		const base = root === "/" ? "" : root;
		const run = await this.git(
			["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
			FILES_BYTES,
			context,
		).catch(() => undefined);
		if (run && (run.exitCode === 0 || run.truncated)) {
			// The text after the last NUL is empty, or a record cut at the output cap. Unmerged files repeat.
			const records = run.stdout.split("\0").slice(0, -1);
			const paths = [...new Set(records)];
			return {
				kind: "files",
				paths: paths.slice(0, FILES_LIMIT),
				truncated: run.truncated || paths.length > FILES_LIMIT,
			};
		}
		const paths: string[] = [];
		const queue = [""];
		let truncated = false;
		for (let index = 0; index < queue.length && !truncated; index++) {
			if (index >= WALK_DIRECTORIES) {
				truncated = true;
				break;
			}
			const relative = queue[index] ?? "";
			const absolute = relative ? `${base}/${relative}` : root;
			const opened = await this.env.openDirReader(absolute, context);
			if (!opened.ok) continue;
			const entries: FileInfo[] = [];
			try {
				for (;;) {
					const page = await opened.value.next(500, context);
					if (!page.ok) break;
					entries.push(...page.value.entries);
					if (entries.length > WALK_DIRECTORY_ENTRIES) {
						truncated = true;
						entries.length = WALK_DIRECTORY_ENTRIES;
						break;
					}
					if (page.value.done) break;
				}
			} finally {
				void opened.value.close(context);
			}
			entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
			for (const entry of entries) {
				const path = relative ? `${relative}/${entry.name}` : entry.name;
				if (entry.kind !== "directory") paths.push(path);
				else if (entry.name !== ".git" && entry.name !== "node_modules") queue.push(path);
				if (paths.length > FILES_LIMIT) {
					truncated = true;
					paths.length = FILES_LIMIT;
					break;
				}
			}
		}
		return { kind: "files", paths, truncated };
	}

	private async git(args: string[], limit: number, context: Context) {
		const filters = await this.filterOverrides(context);
		return this.capture(
			[
				"git",
				"--no-optional-locks",
				"--literal-pathspecs",
				"-c",
				"core.fsmonitor=false",
				"-c",
				"core.quotepath=off",
				"-c",
				"core.pager=cat",
				...filters,
				...args,
			],
			limit,
			context,
		);
	}

	private filters?: Promise<string[]>;
	/** Running watchers: while one runs, any change (or watch error) discards the cached filter overrides. */
	private watchers = 0;
	private filterOverrides(context: Context): Promise<string[]> {
		// Clean/process filters run on stat-dirty files during status and diff. Override every configured driver so
		// repository config cannot run programs from the panel. Kept between requests only while a watcher would report
		// a configuration change; otherwise only requests in flight together share them.
		if (this.filters) return this.filters;
		const pending = this.capture(
			["git", "config", "--name-only", "--get-regexp", "^filter\\."],
			64 * 1024,
			context,
		).then((run) => {
			const drivers = new Set(
				run.stdout
					.split("\n")
					.map((line) => /^filter\.(.+)\.[^.]+$/.exec(line.trim())?.[1])
					.filter((name) => name !== undefined),
			);
			return [...drivers].flatMap((name) => [
				"-c",
				`filter.${name}.clean=`,
				"-c",
				`filter.${name}.smudge=`,
				"-c",
				`filter.${name}.process=`,
				"-c",
				`filter.${name}.required=false`,
			]);
		});
		this.filters = pending;
		void pending.then(
			() => {
				if (!this.watchers && this.filters === pending) this.filters = undefined;
			},
			() => {
				if (this.filters === pending) this.filters = undefined;
			},
		);
		return pending;
	}

	private async capture(argv: string[], limit: number, context: Context) {
		const run = withCancel(context);
		let stdout = "";
		let stderr = "";
		let truncated = false;
		const result = await this.env.exec(
			argv,
			{
				cwd: await this.canonicalRoot(context),
				timeout: GIT_TIMEOUT,
				env: {
					GIT_OPTIONAL_LOCKS: "0",
					GIT_NO_LAZY_FETCH: "1",
					GIT_TERMINAL_PROMPT: "0",
					GIT_CONFIG_NOSYSTEM: "1",
					GIT_PAGER: "cat",
					LC_ALL: "C",
				},
				onOutput: (text, _context, info) => {
					if (info.stream === "stderr") {
						if (stderr.length < 16 * 1024) stderr += text;
						return;
					}
					if (truncated) return;
					stdout += text;
					if (stdout.length > limit) {
						stdout = stdout.slice(0, limit);
						truncated = true;
						run.cancel(new Error("Output limit reached"));
					}
				},
			},
			run.context,
		);
		if (result.ok) return { exitCode: result.value.exitCode, stdout, stderr, truncated };
		if (truncated) return { exitCode: 0, stdout, stderr, truncated };
		if (result.error.code === "timeout") throw new Error("Git timed out");
		if (result.error.code === "spawn_error") throw new Error("Git is not installed in this environment");
		throw new Error(result.error.message);
	}

	/**
	 * Watch the working tree (without .git internals and node_modules) plus the
	 * repository's HEAD and index, which commits and staging change. A linked worktree
	 * (or a directory below the repository root) has them in a git directory elsewhere,
	 * and its config in the main repository's.
	 */
	async watch(onChange: () => void, context: Context): Promise<FileWatcher | undefined> {
		const root = await this.canonicalRoot(context);
		const located = await this.capture(
			["git", "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
			8192,
			context,
		).catch(() => undefined);
		const [gitDir, commonDir] = located?.exitCode === 0 ? located.stdout.split("\n").map((line) => line.trim()) : [];
		const git = gitDir || `${root === "/" ? "" : root}/.git`;
		const config = `${commonDir || git}/config`;
		// Counted in `watchers` from start until closed or failed: a failed watcher reports nothing more.
		const state = { open: false };
		const stop = () => {
			if (!state.open) return;
			state.open = false;
			this.watchers--;
			this.filters = undefined;
		};
		const tree = await this.watchTargets(root, context);
		context.abortSignal?.throwIfAborted();
		const result = await this.env.watch(
			[...tree, { path: `${git}/HEAD` }, { path: `${git}/index` }, { path: config }],
			(change) => {
				// Any change may be configuration: .git/config, or a file it includes from the working tree.
				this.filters = undefined;
				if (change.kind === "failed") stop();
				else onChange();
			},
			context,
		);
		if (!result.ok) return undefined;
		const watcher = result.value;
		state.open = true;
		this.watchers++;
		return {
			mode: watcher.mode,
			stop: async (stopping) => {
				stop();
				await watcher.stop(stopping);
			},
		};
	}

	/**
	 * The working tree's watch targets: the root recursively, or its own entries only for a tree over
	 * `WATCH_DIRECTORIES` folders. Counted with a walk first (stopping at the bound, and when the watch is abandoned), as
	 * the watcher would scan it.
	 */
	private async watchTargets(root: string, context: Context): Promise<WatchTarget[]> {
		const queue = [root];
		let counted = 0;
		for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
			context.abortSignal?.throwIfAborted();
			const listed = await this.env.listDir(next, context);
			if (!listed.ok) continue;
			for (const entry of listed.value) {
				if (entry.kind !== "directory" || WATCH_EXCLUDED.includes(entry.name)) continue;
				if (++counted > WATCH_DIRECTORIES) return [{ path: root }];
				queue.push(`${next === "/" ? "" : next}/${entry.name}`);
			}
		}
		return [{ path: root, recursive: true, exclude: { names: WATCH_EXCLUDED } }];
	}
}
