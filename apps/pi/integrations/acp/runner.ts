import { spawn, type ChildProcess, type ChildProcessByStdio } from "node:child_process";
import { isAbsolute } from "node:path";
import type { Readable, Writable } from "node:stream";

const TURN_TIMEOUT_MS = 120_000;
const SHUTDOWN_GRACE_MS = 250;
const MAX_TEXT_BYTES = 64 * 1024;
const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_STREAM_BYTES = 8 * 1024 * 1024;

type JsonObject = Record<string, unknown>;

export type AcpSessionAdapter = {
	prepareSession: (sessionId: string, session: JsonObject, request: (method: string, params: JsonObject) => Promise<JsonObject>) => Promise<void>;
	checkUpdate: (update: JsonObject) => void;
	cancelRequests: readonly string[];
};

export function object(value: unknown): JsonObject | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

async function* frames(stdout: Readable): AsyncGenerator<JsonObject> {
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let parts: Buffer[] = [];
	let frameBytes = 0;
	let streamBytes = 0;
	for await (const chunk of stdout as AsyncIterable<Buffer>) {
		streamBytes += chunk.length;
		if (streamBytes > MAX_STREAM_BYTES) throw new Error("ACP agent exceeded the protocol output limit.");
		for (let offset = 0; offset < chunk.length;) {
			const newline = chunk.indexOf(10, offset);
			const end = newline === -1 ? chunk.length : newline;
			frameBytes += end - offset;
			if (frameBytes > MAX_FRAME_BYTES) throw new Error("ACP agent exceeded the protocol frame limit.");
			if (end > offset) parts.push(chunk.subarray(offset, end));
			if (newline === -1) break;
			offset = newline + 1;
			let frame: JsonObject | undefined;
			try {
				frame = object(JSON.parse(decoder.decode(Buffer.concat(parts, frameBytes))));
			} catch {
				// The parse error can include untrusted stdout; don't surface it.
			}
			if (frame?.jsonrpc !== "2.0") throw new Error("ACP agent sent an invalid JSON-RPC message.");
			parts = [];
			frameBytes = 0;
			yield frame;
		}
	}
}

function signalAgent(child: ChildProcess, signal: NodeJS.Signals) {
	if (!child.pid) return;
	try {
		if (process.platform === "win32") child.kill(signal);
		else process.kill(-child.pid, signal);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
}

async function waitForExit(exited: Promise<void>): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			exited.then(() => true),
			new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), SHUTDOWN_GRACE_MS); }),
		]);
	} finally {
		clearTimeout(timer);
	}
}

export async function runAcp(options: {
	command: string;
	args: readonly string[];
	cwd: string;
	prompt: string;
	signal: AbortSignal;
	adapter?: AcpSessionAdapter;
	onText?: (chunk: string) => void;
}): Promise<string> {
	const { command, args, cwd, prompt, signal, adapter, onText } = options;
	const aborted = () => new DOMException("ACP run was cancelled.", "AbortError");
	if (signal.aborted) throw aborted();
	if (!isAbsolute(cwd)) throw new Error("ACP working directory must be absolute.");
	const env: NodeJS.ProcessEnv = {};
	for (const key of ["PATH", "HOME"]) {
		if (process.env[key] !== undefined) env[key] = process.env[key];
	}
	let child: ChildProcessByStdio<Writable, Readable, null>;
	try {
		child = spawn(command, args, {
			cwd,
			env,
			shell: false,
			detached: process.platform !== "win32",
			stdio: ["pipe", "pipe", "ignore"],
		});
	} catch {
		throw new Error("Could not start ACP agent.");
	}
	const exited = new Promise<void>((resolve) => {
		child.once("exit", () => resolve());
		child.once("error", () => { if (!child.pid) resolve(); });
	});
	const { promise: interrupted, reject } = Promise.withResolvers<never>();
	let interruption: Error | undefined;
	const interrupt = (error: Error) => {
		interruption ??= error;
		reject(interruption);
	};
	const onAbort = () => interrupt(aborted());
	signal.addEventListener("abort", onAbort, { once: true });
	const deadline = setTimeout(() => interrupt(new Error("ACP run timed out.")), TURN_TIMEOUT_MS);
	child.on("error", () => interrupt(new Error("Could not start or stop ACP agent.")));
	child.stdin.on("error", () => interrupt(new Error("Could not write to ACP agent.")));
	const reader = frames(child.stdout);

	let sessionId: string | undefined;
	let promptPending = false;
	let text = "";
	let textBytes = 0;
	let nextId = 0;

	function send(message: JsonObject): Promise<void> {
		return new Promise((resolve, reject) => {
			child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`, (error) => {
				if (error) reject(new Error("Could not write to ACP agent."));
				else resolve();
			});
		});
	}

	async function request(method: string, params: JsonObject): Promise<JsonObject> {
		if (interruption) throw interruption;
		const id = ++nextId;
		await send({ id, method, params });
		while (true) {
			const frame = await reader.next().catch((error: unknown) => {
				if (error instanceof Error && error.message.startsWith("ACP agent ")) throw error;
				throw new Error(`Could not read ACP agent response to ${method}.`);
			});
			if (interruption) throw interruption;
			if (frame.done) throw new Error(`ACP agent closed stdout before replying to ${method}.`);
			const message = frame.value;
			if (typeof message.method === "string") {
				const params = object(message.params);
				if (typeof message.id === "number" || typeof message.id === "string") {
					if (message.method === "session/request_permission") {
						const options = Array.isArray(params?.options) ? params.options.map(object) : [];
						const rejectId = options.find((option) => option?.kind === "reject_once" && typeof option.optionId === "string")?.optionId;
						const deny = typeof rejectId === "string" && rejectId !== "" && options.filter((option) => option?.optionId === rejectId).length === 1;
						const outcome = deny ? { outcome: "selected", optionId: rejectId } : { outcome: "cancelled" };
						await send({ id: message.id, result: { outcome } });
						if (!deny) throw new Error("ACP agent did not offer an unambiguous one-time permission rejection; cancelled the run.");
					} else if (adapter?.cancelRequests.includes(message.method)) {
						await send({ id: message.id, result: { outcome: { outcome: "cancelled" } } });
					} else {
						await send({ id: message.id, error: { code: -32601, message: "Method not supported" } });
					}
				} else if (sessionId !== undefined && message.method === "session/update" && params?.sessionId === sessionId) {
					const update = object(params.update);
					if (!update) continue;
					adapter?.checkUpdate(update);
					const content = object(update.content);
					if (promptPending && update.sessionUpdate === "agent_message_chunk" && content?.type === "text" && typeof content.text === "string") {
						textBytes += Buffer.byteLength(content.text);
						if (textBytes > MAX_TEXT_BYTES) throw new Error("ACP assistant text exceeded the output limit.");
						text += content.text;
						onText?.(content.text);
					}
				}
				continue;
			}
			if (message.id !== id) throw new Error("ACP agent sent an unexpected response ID.");
			if ("error" in message) {
				if (object(message.error)?.code === -32000) throw new Error("ACP agent requires authentication; sign in separately before running it.");
				throw new Error(`ACP agent rejected ${method}.`);
			}
			const result = object(message.result);
			if (!result) throw new Error(`ACP agent sent an invalid result for ${method}.`);
			return result;
		}
	}

	async function turn() {
		const { protocolVersion } = await request("initialize", {
			protocolVersion: 1,
			clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
		});
		if (protocolVersion !== 1) throw new Error("ACP agent does not support protocol version 1.");
		const session = await request("session/new", { cwd, mcpServers: [] });
		if (typeof session.sessionId !== "string" || !session.sessionId) throw new Error("ACP agent did not return a session ID.");
		sessionId = session.sessionId;
		await adapter?.prepareSession(sessionId, session, request);
		if (interruption) throw interruption;
		promptPending = true;
		const { stopReason } = await request("session/prompt", { sessionId, prompt: [{ type: "text", text: prompt }] });
		promptPending = false;
		if (stopReason !== "end_turn") {
			if (stopReason === "cancelled" || stopReason === "refusal" || stopReason === "max_tokens" || stopReason === "max_turn_requests") {
				throw new Error(`ACP agent stopped before completing the turn (${stopReason}).`);
			}
			throw new Error("ACP agent did not return a valid stop reason.");
		}
		return text;
	}

	try {
		return await Promise.race([turn(), interrupted]);
	} finally {
		clearTimeout(deadline);
		signal.removeEventListener("abort", onAbort);
		if (promptPending && child.stdin.writable) {
			void send({ method: "session/cancel", params: { sessionId } }).catch(() => {});
		}
		child.stdin.end();
		try {
			if (!(await waitForExit(exited))) {
				signalAgent(child, "SIGTERM");
				await waitForExit(exited);
			}
			// A subprocess in the POSIX process group can outlive the agent itself.
			signalAgent(child, "SIGKILL");
			if (!(await waitForExit(exited))) child.unref();
		} finally {
			child.stdout.destroy();
			child.stdin.destroy();
			void reader.return(undefined).catch(() => {});
		}
	}
}
