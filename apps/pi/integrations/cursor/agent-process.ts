// The detached process that runs one local Cursor agent: `node agent-process.ts <run directory>`. The Pi server starts it in
// a session of its own and only watches the files it writes (rundir.ts), so a Pi restart does not stop the run. It is NOT
// durable: if this process dies (crash, kill, reboot) the run is gone, and the server says so. The API key arrives in the
// environment only, is removed from it before the agent starts, and is redacted from everything written here.
import { existsSync } from "node:fs";
import { uptime } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSandboxUnsupported, oneLine, type Outcome, type RunEvent, type RunHandle, redact, SandboxUnsupportedError } from "./client.ts";
import { LIMITS } from "./limits.ts";
import { checkRequest } from "./local-policy.ts";
import { type AcpWorkerRequest, appendText, FILES, processStart, readJson, type SdkWorkerRequest, type WorkerExit, type WorkerRequest, type WorkerStatus, writeJsonAtomic } from "./rundir.ts";
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
type WorkerHandle = Omit<RunHandle, "agentId" | "runId"> & Partial<Pick<RunHandle, "agentId" | "runId">>;
let handle: WorkerHandle | undefined;
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
	...(handle?.agentId === undefined ? {} : { agentId: handle.agentId }),
	...(handle?.runId === undefined ? {} : { cursorRunId: handle.runId }),
	...(sandbox === undefined ? {} : { sandbox }),
	...(activity === undefined ? {} : { activity }),
	files: [...files].slice(0, 50),
	chars,
});
const writeStatus = () => writeJsonAtomic(join(directory, FILES.status), status()).catch(() => {});

/** The files are written in the order things happened, one at a time. */
let writes: Promise<unknown> = Promise.resolve();
const write = (name: string, text: string) => void (writes = writes.then(() => appendText(join(directory, name), text)).catch(() => {}));

function record(event: RunEvent): void {
	// State first, all at once: the order of events is the order of the stream.
	let piece = "";
	if (event.type === "text") {
		// Backends stream the answer as small deltas: they are joined as they come, with nothing between them (the text's own
		// line breaks are the only ones).
		piece = safe(event.text).slice(0, Math.max(0, PARTIAL_MAX - partial.length));
		partial += piece;
		chars = partial.length;
		activity = `said: …${oneLine(partial.slice(-100), 100)}`;
	} else {
		activity = oneLine(safe(`${event.name}${event.path ? ` ${event.path}` : ""} (${event.status})`), 200);
		if (event.path && WRITING.test(event.name)) files.add(safe(event.path).slice(0, 300));
	}
	if (piece !== "") write(FILES.partial, piece);
	const line = `${JSON.stringify({ at: Date.now(), ...(event.type === "text" ? { type: "text", text: safe(event.text).slice(0, 200) } : { ...event, name: safe(event.name), path: event.path && safe(event.path) }) })}\n`;
	if (eventBytes + line.length < EVENTS_MAX) {
		eventBytes += line.length;
		write(FILES.events, line);
	}
}

/** The last thing this process does: the text, then the exit file (its presence is a clean exit), then out. */
async function end(result: Pick<WorkerExit, "status"> & Partial<WorkerExit>, text: string): Promise<never> {
	if (ended) return new Promise<never>(() => {});
	ended = true;
	await writes;
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

async function main(): Promise<void> {
	const request = await readJson<WorkerRequest>(join(directory, FILES.request));
	if (request === undefined) throw new Error("No request");
	start = (await processStart(process.pid)) ?? "";
	await writeStatus();
	const heartbeat = setInterval(() => void writeStatus(), request.heartbeatMs);
	heartbeat.unref?.();
	try {
		await checkRequest(request);
		if (request.version === 1 && key === "") throw new Error("No API key reached the worker");
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

	handle = request.version === 2 ? startAcp(request) : await startSdk(request);
	handle.watch?.((event) => record(event));
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
	if (request.version === 2 && outcome.status === "error" && Date.now() >= deadline) timedOut = true;
	const common = {
		...(outcome.usage === undefined ? {} : { usage: outcome.usage }),
		...(outcome.git === undefined ? {} : { git: outcome.git }),
	};
	if (timedOut) await end({ status: "timed-out", error: "The run took longer than its time limit", ...common }, text);
	else if (cancelRequested || outcome.status === "cancelled") await end({ status: "cancelled", ...common }, text);
	else if (outcome.status === "error") await end({ status: "failed", error: outcome.error ?? "The run failed", ...common }, text);
	else await end({ status: "finished", ...common }, text);
}

function startAcp(request: AcpWorkerRequest): WorkerHandle {
	const controller = new AbortController();
	let onEvent: ((event: RunEvent) => void) | undefined;
	return {
		async wait(): Promise<Outcome> {
			try {
				const [{ cursorAcpSession }, { runAcp }] = await Promise.all([import("./acp-runtime/cursor.ts"), import("./acp-runtime/runner.ts")]);
				const guard = fileURLToPath(new URL("./acp-runtime/guard.ts", import.meta.url));
				const text = await runAcp({
					command: process.execPath,
					args: [guard, request.command, "acp"],
					cwd: request.cwd,
					prompt: request.prompt,
					signal: controller.signal,
					timeoutMs: request.deadline - Date.now(),
					adapter: cursorAcpSession(request.mode, request.model),
					parentLease: true,
					onText: (text) => onEvent?.({ type: "text", text }),
				});
				return { status: "finished", text };
			} catch (error) {
				return controller.signal.aborted ? { status: "cancelled" } : { status: "error", error: error instanceof Error ? error.message : "Cursor ACP failed" };
			}
		},
		async cancel() { controller.abort(); },
		watch(callback) { onEvent = callback; },
		dispose() {},
	};
}

async function startSdk(request: SdkWorkerRequest): Promise<RunHandle> {
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
		return await client.start({ ...base, sandbox: request.sandbox });
	} catch (error) {
		const refused = error instanceof SandboxUnsupportedError || (error instanceof Error && isSandboxUnsupported(error.message));
		if (!refused || !request.sandbox) throw error;
		sandboxUnsupported = true;
		if (request.sandboxMode === "required")
			throw new Error("Local sandboxing is set to “required” in Settings › Cursor, but Cursor's SDK says it is not supported on this machine. Set it to “when possible” or “off”, or use a cloud run");
		sandbox = "unavailable";
		return await client.start({ ...base, sandbox: false });
	}
}

function runAgentProcess(): void {
	process.on("uncaughtException", (error) => void failed(error));
	process.on("unhandledRejection", (error) => void failed(error));
	process.on("SIGTERM", () => void end({ status: cancelRequested ? "cancelled" : "failed", error: "The worker was told to stop" }, partial));
	void main().catch(failed);
}

if (import.meta.main) runAgentProcess();
