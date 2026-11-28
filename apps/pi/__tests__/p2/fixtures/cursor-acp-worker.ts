// Executable fake Cursor CLI. The real detached worker, ACP runner and lease guard remain unmodified.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

assert.deepEqual(process.argv.slice(2), ["acp"]);
assert.equal(process.env.CURSOR_API_KEY, undefined);
assert.equal(process.env.CURSOR_AUTH_TOKEN, undefined);
process.on("SIGTERM", () => {});
const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
const directory = process.cwd();
writeFileSync(join(directory, "acp-processes"), JSON.stringify([process.ppid, process.pid, child.pid]));
const send = (fields: Record<string, unknown>, after?: () => void) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...fields })}\n`, after);
const sessionId = "synthetic-acp-not-an-sdk-id";
const chunk = (text: string) => send({ method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });
let mode = "agent";
let model = "fake-cli-default";
let pending: number | undefined;
const config = () => ({ configOptions: [
	{ id: "mode", type: "select", currentValue: mode, options: ["ask", "plan", "agent"].map((value) => ({ value })) },
	{ id: "model", type: "select", currentValue: model, options: ["fake-cli-default", "composer-2", "composer-2[fast=true]"].map((value) => ({ value })) },
] });
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
	const { id, method, params, result } = JSON.parse(line);
	if (method === "initialize") send({ id, result: { protocolVersion: 1 } });
	else if (method === "session/new") {
		assert.deepEqual(params.mcpServers, []);
		send({ id, result: { sessionId, ...config() } });
	} else if (method === "session/set_config_option") {
		if (params.configId === "mode") mode = params.value;
		else if (params.configId === "model") model = params.value;
		else assert.fail("Unexpected ACP option");
		send({ id, result: config() });
	} else if (method === "session/prompt") {
		assert.equal(params.sessionId, sessionId);
		writeFileSync(join(directory, "acp-prompt"), JSON.stringify({ mode, model, prompt: params.prompt[0].text }));
		pending = id;
		send({ id: "permission", method: "session/request_permission", params: { sessionId, options: [
			{ kind: "allow_once", optionId: "allow" }, { kind: "reject_once", optionId: "deny" },
		] } });
	} else if (id === "permission") {
		assert.equal(result.outcome.optionId, mode === "agent" ? "allow" : "deny");
		chunk("synthetic partial");
	} else if (method === "session/cancel") {
		assert.equal(params.sessionId, sessionId);
		writeFileSync(join(directory, "acp-cancelled"), "yes");
		send({ id: pending, result: { stopReason: "cancelled" } }, () => process.exit(0));
	} else assert.fail("Unexpected ACP method");
}
