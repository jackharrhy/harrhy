// A local run's directory, `<data>/cursor-runs/<run id>/`, which the detached agent process writes and the server only
// observes. Plain Node modules only (the agent process imports this file). Every JSON file is written atomically; the
// directory is 0700 and the files 0600. The API key is never in any of them.
import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

export const FILES = {
	request: "request.json",
	status: "status.json",
	exit: "exit.json",
	partial: "partial.txt",
	result: "result.txt",
	events: "events.jsonl",
	cancel: "cancel",
	log: "worker.log",
} as const;

/** What the server asks of the agent process (no key: that comes in the environment). */
export type WorkerRequest = {
	version: 1;
	runId: string;
	prompt: string;
	model: string;
	modelParams?: { id: string; value: string }[];
	mode: "ask" | "plan" | "agent";
	/** The session's directory and the directory the agent works in (below it). */
	base: string;
	cwd: string;
	/** The owner's settings when the run started: edits allowed, and the sandbox choice. */
	allowEdits: boolean;
	sandboxMode: "when-possible" | "required" | "off";
	/** Ask the SDK for its sandbox (the server already knows if this machine cannot). */
	sandbox: boolean;
	deadline: number;
	heartbeatMs: number;
	pollMs: number;
	/** 1 for a run's first worker; a resumed run's later workers count up. */
	attempt: number;
	/** The Cursor agent to go on with, and what to tell it, when this worker resumes an interrupted run. */
	resume?: { agentId: string; message: string };
};

/** The agent process's pulse: rewritten every heartbeat. */
export type WorkerStatus = {
	pid: number;
	/** `ps`'s start time of the process: with the pid it tells a worker from a reused pid. */
	start: string;
	startedAt: number;
	/** The machine's boot time as this worker saw it: a different one later means the machine rebooted. */
	bootAt: number;
	state: "starting" | "running";
	heartbeatAt: number;
	agentId?: string;
	cursorRunId?: string;
	sandbox?: "on" | "off" | "unavailable";
	/** The last thing the agent did (a tool, some text), one short line. */
	activity?: string;
	/** Files an editing tool named, at most 50. */
	files: string[];
	/** Characters of text streamed so far. */
	chars: number;
};

/** How the agent process ended, when it could say. Written last; its presence means a clean exit. */
export type WorkerExit = {
	status: "finished" | "failed" | "cancelled" | "timed-out";
	error?: string;
	endedAt: number;
	durationMs: number;
	usage?: { inputTokens: number; outputTokens: number; totalTokens: number; chargedCents?: number };
	git?: { branch?: string; prUrl?: string };
	sandbox?: "on" | "off" | "unavailable";
	/** The SDK refused the sandbox here (the server remembers). */
	sandboxUnsupported?: boolean;
	files: string[];
};

const run = promisify(execFile);

/** Writes `value` as JSON to `path` through a temporary file, so a reader never sees half of it. */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
	await rename(temporary, path);
}

/** The JSON in `path`, or undefined when it is missing or not (yet) whole. */
export async function readJson<T>(path: string): Promise<T | undefined> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as T;
	} catch {
		return undefined;
	}
}

/** Text file's content, or "" when there is none. */
export async function readText(path: string, max: number): Promise<string> {
	try {
		return (await readFile(path, "utf8")).slice(0, max);
	} catch {
		return "";
	}
}

export async function makeRunDirectory(root: string, id: string): Promise<string> {
	await mkdir(root, { recursive: true, mode: 0o700 });
	const directory = join(root, id);
	await mkdir(directory, { mode: 0o700 });
	return directory;
}

/** Moves what an earlier worker left in `directory` into `attempt-<n>/`, so the next worker starts clean and nothing is lost. */
export async function archiveAttempt(directory: string, attempt: number): Promise<void> {
	const target = join(directory, `attempt-${attempt}`);
	await mkdir(target, { mode: 0o700, recursive: true });
	for (const name of Object.values(FILES)) {
		try {
			await rename(join(directory, name), join(target, name));
		} catch {
			// Not every attempt leaves every file.
		}
	}
}

export const appendText = (path: string, text: string) => appendFile(path, text, { mode: 0o600 });

/** `ps`'s start time for `pid` (the same string every time for one process), or undefined when there is no such process. */
export async function processStart(pid: number): Promise<string | undefined> {
	try {
		const { stdout } = await run("ps", ["-o", "lstart=", "-p", String(pid)], { timeout: 5000 });
		return stdout.trim() || undefined;
	} catch {
		return undefined;
	}
}

/** Whether `pid` is the process that started at `start`. */
export async function isWorker(pid: number, start: string): Promise<boolean> {
	return (await processStart(pid)) === start;
}
