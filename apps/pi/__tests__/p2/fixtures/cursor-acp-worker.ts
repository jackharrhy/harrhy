import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { cursorAcpSession } from "../../../integrations/acp/cursor.ts";
import { runAcp } from "../../../integrations/acp/runner.ts";
import type { Outcome, RunEvent } from "../../../integrations/cursor/client.ts";
import type { WorkerRequest } from "../../../integrations/cursor/rundir.ts";

// Imported only from the temporary plugin's test entrypoint. There is no configuration or tool that can select it.
export async function startFixtureAcp(request: WorkerRequest) {
	assert.ok(request.mode === "ask" || request.mode === "plan");
	assert.ok(!request.resume && !request.sandbox && request.sandboxMode !== "required");
	const controller = new AbortController();
	let watch: ((event: RunEvent) => void) | undefined;
	const done = runAcp({
		command: process.execPath,
		args: [import.meta.filename, "guard", process.cwd(), request.mode],
		cwd: request.cwd,
		prompt: request.prompt,
		adapter: cursorAcpSession(request.mode),
		signal: controller.signal,
		parentLease: true,
		onText: (text) => watch?.({ type: "text", text }),
	}).then<Outcome, Outcome>(
		(text) => ({ status: "finished", text }),
		(error: Error) => controller.signal.aborted ? { status: "cancelled" } : { status: "error", error: error.message },
	);
	return {
		wait: () => done,
		cancel: async () => controller.abort(),
		watch: (callback: (event: RunEvent) => void) => { watch = callback; },
		dispose: () => {},
	};
}

// A test-only process-group leader and lease reader, not a run supervisor. The agent never receives fd 3.
function guard(directory: string, mode: string) {
	const stop = () => process.kill(-process.pid, "SIGKILL");
	const lease = new Socket({ fd: 3, readable: true, writable: false });
	lease.once("end", stop);
	lease.once("error", stop);
	lease.resume();
	writeFileSync(join(directory, "acp-group"), String(process.pid));
	const child = spawn(process.execPath, [import.meta.filename, "agent", directory, mode], { stdio: "inherit" });
	child.once("exit", stop);
	child.once("error", stop);
}

async function agent(directory: string, mode: string) {
	assert.equal(process.env.CURSOR_API_KEY, undefined);
	assert.equal(process.env.CURSOR_AUTH_TOKEN, undefined);
	process.on("SIGTERM", () => {});
	// Neither this agent nor its child exits on worker death or ACP pipe closure by itself.
	const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
	writeFileSync(join(directory, "acp-processes"), JSON.stringify([process.pid, child.pid]));
	const send = (fields: Record<string, unknown>, after?: () => void) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...fields })}\n`, after);
	const sessionId = "synthetic-acp-not-an-sdk-id";
	const chunk = (text: string) => send({ method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });
	let pending: number | undefined;
	setInterval(() => {
		if (pending === undefined) return;
		if (existsSync(join(directory, "fail-acp"))) {
			send({ id: pending, error: { code: -32603, message: "untrusted backend error" } }, () => process.exit(0));
		} else if (existsSync(join(directory, "finish-acp"))) {
			chunk(" finished after restart");
			send({ id: pending, result: { stopReason: "end_turn" } }, () => process.exit(0));
		} else return;
		pending = undefined;
	}, 25);
	for await (const line of createInterface({ input: process.stdin })) {
		const { id, method, params } = JSON.parse(line);
		if (method === "initialize") send({ id, result: { protocolVersion: 1 } });
		else if (method === "session/new") {
			assert.deepEqual(params.mcpServers, []);
			send({ id, result: { sessionId, configOptions: [{ id: "mode", type: "select", currentValue: mode, options: [{ value: mode }] }] } });
		} else if (method === "session/prompt") {
			assert.equal(params.sessionId, sessionId);
			pending = id;
			chunk("synthetic partial");
		} else if (method === "session/cancel") {
			assert.equal(params.sessionId, sessionId);
			writeFileSync(join(directory, "acp-cancelled"), "yes");
			send({ id: pending, result: { stopReason: "cancelled" } }, () => process.exit(0));
		} else assert.fail("Unexpected ACP method");
	}
}

if (import.meta.main) {
	const [role, directory, mode] = process.argv.slice(2);
	assert.ok(directory && mode);
	if (role === "guard") guard(directory, mode);
	else if (role === "agent") await agent(directory, mode);
	else assert.fail("Unexpected fixture role");
}
