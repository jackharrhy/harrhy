import assert from "node:assert/strict";
import { realpathSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const [mode = "acp", argument] = process.argv.slice(2);
const input = createInterface({ input: process.stdin });
const sessionId = "fake-acp-session";
const cursor = mode === "cursor";
const noSafeChoice = argument === "ambiguous-permission";
const requestedMode = argument === "plan" ? "plan" : "ask";
let configuredMode = "agent";
let configuredModel = "auto";
const composer = "composer-2.5[fast=true]";

function configOptions(currentValue: string) {
	return [{ id: "mode", name: "Mode", category: "mode", type: "select", currentValue, options: [
		{ value: "agent", name: "Agent" }, { value: "ask", name: "Ask" }, { value: "plan", name: "Plan" },
	] }, { id: "model", name: "Model", category: "model", type: "select", currentValue: configuredModel, options: [
		{ value: "auto", name: "Auto" }, { value: composer, name: "Composer 2.5" },
	] }];
}

function send(fields: Record<string, unknown>) {
	process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...fields })}\n`);
}

function update(kind: string, text: string, session = sessionId) {
	send({ method: "session/update", params: { sessionId: session, update: { sessionUpdate: kind, content: { type: "text", text } } } });
}

let promptId: unknown;
for await (const line of input) {
	const message = JSON.parse(line);
	assert.equal(message.jsonrpc, "2.0");
	if (message.method === "initialize") {
		assert.equal(message.params.protocolVersion, 1);
		assert.deepEqual(message.params.clientCapabilities, { fs: { readTextFile: false, writeTextFile: false }, terminal: false });
		if (mode === "hang-initialize") continue;
		if (mode === "bad-frame") {
			process.stdout.write("x".repeat(1024 * 1024 + 1));
			continue;
		}
		send({ id: message.id, result: {
			protocolVersion: mode === "bad-version" ? 2 : 1,
			...(cursor ? { authMethods: [{ id: "cursor_login", name: "Cursor login" }] } : {}),
		} });
	} else if (message.method === "session/new") {
		assert.equal(realpathSync(message.params.cwd), process.cwd());
		assert.deepEqual(message.params.mcpServers, []);
		if (mode === "auth-error" || (cursor && argument === "auth-error")) {
			process.stderr.write("agent stderr must not be surfaced\n");
			send({ id: message.id, error: { code: -32000, message: "private error from agent" } });
		} else {
			send({ id: message.id, result: { sessionId, ...(cursor && argument !== "missing-mode" ? { configOptions: configOptions(configuredMode) } : {}) } });
		}
	} else if (message.method === "session/set_config_option") {
		assert.ok(cursor && argument !== "missing-mode");
		if (message.params.configId === "model") {
			assert.deepEqual(message.params, { sessionId, configId: "model", value: composer });
			configuredModel = composer;
		} else {
			assert.deepEqual(message.params, { sessionId, configId: "mode", value: requestedMode });
			if (argument !== "bad-mode-ack") configuredMode = requestedMode;
		}
		send({ id: message.id, result: { configOptions: configOptions(configuredMode) } });
	} else if (message.method === "session/prompt") {
		assert.equal(message.params.sessionId, sessionId);
		assert.equal(message.params.prompt.length, 1);
		assert.equal(message.params.prompt[0].type, "text");
		assert.equal(typeof message.params.prompt[0].text, "string");
		promptId = message.id;
		if (mode === "close") process.exit(0);
		if (mode === "check-env") {
			assert.equal(message.params.prompt[0].text, 'hello\n"ACP"');
			assert.equal(argument, "literal ; $(not-a-command) \"quoted\"");
			for (const key of ["P2_DATA_DIR", "GOOGLE_API_KEY", "ANTIGRAVITY_API_KEY", "GEMINI_API_KEY", "CURSOR_API_KEY", "CURSOR_AUTH_TOKEN", "HARRHY_PI_HTTP_PROXY", "NODE_OPTIONS"]) {
				assert.equal(process.env[key], undefined, key);
			}
			assert.ok(process.env.HOME);
		}
		if (mode === "hang") {
			assert.ok(argument);
			process.on("SIGTERM", () => {});
			setInterval(() => {}, 1000);
			writeFileSync(`${argument}.ready`, String(process.pid));
			continue;
		}
		if (mode === "overflow") {
			update("agent_message_chunk", "é".repeat(32 * 1024 + 1));
			continue;
		}
		if (mode === "refusal") {
			send({ id: promptId, result: { stopReason: "refusal" } });
			continue;
		}
		if (cursor) {
			assert.ok(argument !== "missing-mode" && argument !== "bad-mode-ack");
			assert.equal(configuredMode, requestedMode);
			if (argument === "composer") assert.equal(configuredModel, composer);
			if (argument === "mode-change") {
				send({ method: "session/update", params: { sessionId, update: { sessionUpdate: "config_option_update", configOptions: configOptions("agent") } } });
				continue;
			}
		}
		update("agent_thought_chunk", "ignore thoughts");
		update("agent_message_chunk", "ignore other sessions", "unrelated");
		update("agent_message_chunk", "hello ");
		const rejectId = noSafeChoice ? "allow" : cursor ? "reject-once" : "deny";
		send({ id: "permission", method: "session/request_permission", params: { sessionId, toolCall: { toolCallId: "fake-tool" }, options: [
			{ optionId: "allow", kind: "allow_once", name: "Allow" },
			{ optionId: rejectId, kind: "reject_once", name: "Deny" },
		] } });
	} else if (message.method === "session/cancel") {
		assert.equal(message.params.sessionId, sessionId);
		if (mode === "hang") {
			writeFileSync(`${argument}.cancelled`, "yes");
			send({ id: promptId, result: { stopReason: "cancelled" } });
		}
	} else if (message.id === "permission") {
		if (noSafeChoice) {
			assert.deepEqual(message.result, { outcome: { outcome: "cancelled" } });
			continue;
		}
		assert.deepEqual(message.result, { outcome: { outcome: "selected", optionId: cursor ? "reject-once" : "deny" } });
		send({ id: "fs", method: "fs/read_text_file", params: { sessionId, path: "/must-not-be-read" } });
	} else if (message.id === "fs") {
		assert.equal(message.error.code, -32601);
		send({ id: "terminal", method: "terminal/create", params: { sessionId, command: "must-not-run" } });
	} else if (message.id === "terminal") {
		assert.equal(message.error.code, -32601);
		if (cursor) {
			send({ method: "cursor/update_todos", params: { toolCallId: "todos", todos: [], merge: false } });
			send({ id: "question", method: "cursor/ask_question", params: { toolCallId: "q", questions: [
				{ id: "q1", prompt: "May I run a command?", options: [{ id: "yes", label: "Yes" }] },
			] } });
		} else {
			update("agent_message_chunk", "from ACP");
			send({ id: promptId, result: { stopReason: "end_turn" } });
		}
	} else if (cursor && message.id === "question") {
		assert.deepEqual(message.result, { outcome: { outcome: "cancelled" } });
		send({ id: "plan", method: "cursor/create_plan", params: { toolCallId: "p", plan: "Modify files", todos: [] } });
	} else if (cursor && message.id === "plan") {
		assert.deepEqual(message.result, { outcome: { outcome: "cancelled" } });
		update("agent_message_chunk", "from Cursor ACP");
		send({ id: promptId, result: { stopReason: "end_turn" } });
	} else {
		assert.fail("Unexpected ACP input");
	}
}
