// The detached process that runs one local Cursor agent: `node agent-process.ts <run directory>`. The Pi server starts it in
// a session of its own and only watches the files it writes (rundir.ts), so a Pi restart does not stop the run. It is NOT
// durable: if this process dies (crash, kill, reboot) the run is gone, and the server says so. The API key arrives in the
// environment only, is removed from it before the agent starts, and is redacted from everything written here.
import { existsSync } from "node:fs";
import { uptime } from "node:os";
import { join } from "node:path";
import { isSandboxUnsupported, oneLine, type Outcome, type RunEvent, type RunHandle, redact, SandboxUnsupportedError } from "./client.ts";
import { LIMITS } from "./limits.ts";
import { checkRequest } from "./local-policy.ts";
import { appendText, FILES, processStart, readJson, type WorkerExit, type WorkerRequest, type WorkerStatus, writeJsonAtomic } from "./rundir.ts";
import { sdkClient } from "./sdk.ts";

const directory = process.argv[2] ?? "";
const key = process.env.CURSOR_API_KEY ?? "";
// The agent's own shell must not inherit the key.
delete process.env.CURSOR_API_KEY;
const safe = (text: string) => redact(text, key);

// Whatever the SDK prints goes to worker.log, without the key.
for (const stream of [process.stdout, process.stderr]) {
	const write = stream.write.bind(stream) as (chunk: unknown, ...rest: unknown[]) => boolean;
	(stream as { write: unknown }).write = (chunk: unknown, ...rest: unknown[]) =>
		write(typeof chunk === "string" ? safe(chunk) : safe(Buffer.from(chunk as Uint8Array).toString()), ...rest);
}

const PARTIAL_MAX = 64_000;
const EVENTS_MAX = 1_000_000;
const WRITING = /edit|write|delete|replace|patch/i;

const startedAt = Date.now();
let request: WorkerRequest | undefined;
let handle: RunHandle | undefined;
let start = "";
let state: WorkerStatus["state"] = "starting";
let sandbox: WorkerStatus["sandbox"];
let sandboxUnsupported = false;
let activity: string | undefined;
let chars = 0;
let partial = "";
let eventBytes = 0;
const files = new Set<string>();
let cancelRequested = false;
let timedOut = false;
let ended = false;

const status = (): WorkerStatus => ({
	pid: process.pid,
	start,
	startedAt,
	bootAt: Date.now() - Math.round(uptime() * 1000),
	state,
	heartbeatAt: Date.now(),
	...(handle === undefined ? {} : { agentId: handle.agentId, cursorRunId: handle.runId }),
	...(sandbox === undefined ? {} : { sandbox }),
	...(activity === undefined ? {} : { activity }),
	files: [...files].slice(0, 50),
	chars,
});
const writeStatus = () => writeJsonAtomic(join(directory, FILES.status), status()).catch(() => {});

async function record(event: RunEvent): Promise<void> {
	if (event.type === "text") {
		const text = safe(event.text);
		activity = `said: ${oneLine(text, 120)}`;
		if (partial.length < PARTIAL_MAX) {
			const room = PARTIAL_MAX - partial.length;
			const piece = text.slice(0, room) + (text.endsWith("\n") ? "" : "\n");
			partial += piece;
			chars = partial.length;
			await appendText(join(directory, FILES.partial), piece).catch(() => {});
		}
	} else {
		activity = oneLine(safe(`${event.name}${event.path ? ` ${event.path}` : ""} (${event.status})`), 200);
		if (event.path && WRITING.test(event.name)) files.add(safe(event.path).slice(0, 300));
	}
	const line = `${JSON.stringify({ at: Date.now(), ...(event.type === "text" ? { type: "text", text: safe(event.text).slice(0, 200) } : { ...event, name: safe(event.name), path: event.path && safe(event.path) }) })}\n`;
	if (eventBytes + line.length < EVENTS_MAX) {
		eventBytes += line.length;
		await appendText(join(directory, FILES.events), line).catch(() => {});
	}
}

/** The last thing this process does: the text, then the exit file (its presence is a clean exit), then out. */
async function end(result: Pick<WorkerExit, "status"> & Partial<WorkerExit>, text: string): Promise<never> {
	if (ended) return new Promise<never>(() => {});
	ended = true;
	const bounded = safe(text).slice(0, LIMITS.result);
	try {
		if (bounded !== "") await writeJsonAtomic(join(directory, FILES.result), { text: bounded });
		const exit: WorkerExit = {
			endedAt: Date.now(),
			durationMs: Date.now() - startedAt,
			files: [...files].slice(0, 50),
			...(sandbox === undefined ? {} : { sandbox }),
			...(sandboxUnsupported ? { sandboxUnsupported } : {}),
			...result,
			...(result.error === undefined ? {} : { error: oneLine(safe(result.error), 500) }),
		};
		await writeJsonAtomic(join(directory, FILES.exit), exit);
	} catch {
		// Nothing more can be said: the server will find a dead worker and report it lost.
	}
	process.exit(0);
}

const failed = (error: unknown) => end({ status: "failed", error: error instanceof Error ? error.message : String(error) }, partial);
process.on("uncaughtException", (error) => void failed(error));
process.on("unhandledRejection", (error) => void failed(error));
process.on("SIGTERM", () => void end({ status: cancelRequested ? "cancelled" : "failed", error: "The worker was told to stop" }, partial));

async function main(): Promise<void> {
	request = await readJson<WorkerRequest>(join(directory, FILES.request));
	if (request === undefined) throw new Error("No request");
	start = (await processStart(process.pid)) ?? "";
	await writeStatus();
	const heartbeat = setInterval(() => void writeStatus(), request.heartbeatMs);
	heartbeat.unref?.();
	try {
		await checkRequest(request);
		if (key === "") throw new Error("No API key reached the worker");
	} catch (error) {
		return void (await failed(error));
	}
	const { deadline, pollMs } = request;
	const grace = Number(process.env.P2_CURSOR_GRACE_MS) || 15_000;
	const onDeadline = () => {
		timedOut = true;
		void handle?.cancel().catch(() => {});
	};
	setTimeout(onDeadline, Math.max(0, deadline - Date.now()));
	// A run that ignores its cancellation is given up on after a grace period.
	setTimeout(() => void end({ status: "timed-out", error: "The run did not end in time and was given up on" }, partial), Math.max(0, deadline - Date.now()) + grace);
	setInterval(() => {
		if (!cancelRequested && existsSync(join(directory, FILES.cancel))) {
			cancelRequested = true;
			void handle?.cancel().catch(() => {});
			setTimeout(() => void end({ status: "cancelled", error: "The run did not answer its cancellation" }, partial), grace);
		}
	}, pollMs);

	const client = await sdkClient(key);
	const base = {
		runtime: "local" as const,
		prompt: request.prompt,
		model: request.model,
		...(request.modelParams === undefined ? {} : { modelParams: request.modelParams }),
		cwd: request.cwd,
		mode: request.mode,
		// A resumed run goes on with the Cursor agent an earlier worker made, and is told what happened.
		...(request.resume === undefined ? {} : { resume: request.resume }),
	};
	if (request.mode === "agent") sandbox = request.sandbox ? "on" : request.sandboxMode === "off" ? "off" : "unavailable";
	try {
		handle = await client.start({ ...base, sandbox: request.sandbox });
	} catch (error) {
		const refused = error instanceof SandboxUnsupportedError || (error instanceof Error && isSandboxUnsupported(error.message));
		if (!refused || !request.sandbox) throw error;
		sandboxUnsupported = true;
		if (request.sandboxMode === "required")
			throw new Error("Local sandboxing is set to “required” in Settings › Cursor, but Cursor's SDK says it is not supported on this machine. Set it to “when possible” or “off”, or use a cloud run");
		sandbox = "unavailable";
		handle = await client.start({ ...base, sandbox: false });
	}
	handle.watch?.((event) => void record(event));
	state = "running";
	await writeStatus();
	if (cancelRequested) void handle.cancel().catch(() => {});

	let outcome: Outcome;
	try {
		outcome = await handle.wait();
	} catch (error) {
		return void (await failed(error));
	}
	handle.dispose();
	const text = outcome.text ?? partial;
	const common = {
		...(outcome.usage === undefined ? {} : { usage: outcome.usage }),
		...(outcome.git === undefined ? {} : { git: outcome.git }),
	};
	if (timedOut) await end({ status: "timed-out", error: "The run took longer than its time limit", ...common }, text);
	else if (cancelRequested || outcome.status === "cancelled") await end({ status: "cancelled", ...common }, text);
	else if (outcome.status === "error") await end({ status: "failed", error: outcome.error ?? "The run failed", ...common }, text);
	else await end({ status: "finished", ...common }, text);
}

main().catch((error: unknown) => void failed(error));
