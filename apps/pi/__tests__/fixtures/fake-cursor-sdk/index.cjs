// A stand-in for the `@cursor/sdk` package, installed by the cursor tests into a fixture plugin's node_modules. It has the
// SDK's call shapes (Agent.create / Agent.resume / agent.send / run.wait / run.stream, Cursor.me, Cursor.models.list) and
// never touches the network or a credential.
//
// In the test process (the Pi server's cloud runs, the sandbox probe, the model list) it does whatever the test's
// `globalThis.__cursorFake` says. In a detached agent process (local runs) there is no such object: it is driven by files in
// the directory CURSOR_FAKE_CONTROL names, which the test writes and reads (`config.json`, `finish-<run>.json`, ...).
const fs = require("node:fs");
const path = require("node:path");

const inProcess = () => globalThis.__cursorFake;
const control = () => process.env.CURSOR_FAKE_CONTROL;
const file = (name) => path.join(control(), name);
const exists = (name) => fs.existsSync(file(name));
const readJson = (name) => {
	try {
		return JSON.parse(fs.readFileSync(file(name), "utf8"));
	} catch {
		return undefined;
	}
};
const lines = (name) => {
	try {
		return fs.readFileSync(file(name), "utf8").split("\n").filter(Boolean);
	} catch {
		return [];
	}
};
const append = (name, text) => fs.appendFileSync(file(name), text);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SANDBOX_MESSAGE =
	"Local SDK sandboxing was requested, but sandboxing is not supported in this environment. Disable local.sandboxOptions.enabled or remove ~/.cursor/sandbox.json to run without sandboxing.";

function fileAgent(options, resumeId) {
	const config = readJson("config.json") ?? {};
	const number = lines("created.jsonl").length + 1;
	if (config.createError) throw new Error(config.createError);
	if (config.sandboxUnsupported && options.local?.sandboxOptions?.enabled) throw new Error(SANDBOX_MESSAGE);
	append(
		"created.jsonl",
		`${JSON.stringify({ number, options, argv: process.argv, envHasKey: Boolean(process.env.CURSOR_API_KEY), resumeId })}\n`,
	);
	const agentId = resumeId ?? `bc-agent-${number}`;
	return {
		agentId,
		close() {},
		getUsage: async () => ({ cost: { chargedCents: 12.4 } }),
		send: async (prompt, sendOptions) => {
			if (resumeId && !sendOptions?.local?.force && config.activeRunBlocks) throw new Error(`Agent ${agentId} already has active run`);
			const runNumber = lines("runs.jsonl").length + 1;
			const id = `run-${runNumber}`;
			append("runs.jsonl", `${JSON.stringify({ id, agentId, prompt, sendOptions })}\n`);
			let done = false;
			const wait = async () => {
				for (;;) {
					if (exists(`fail-${id}`)) throw new Error(fs.readFileSync(file(`fail-${id}`), "utf8"));
					const finish = readJson(`finish-${id}.json`);
					if (finish) {
						done = true;
						return finish;
					}
					if (exists(`cancelled-${id}`) && !exists(`ignore-cancel-${id}`)) {
						done = true;
						return { status: "cancelled" };
					}
					await sleep(20);
				}
			};
			return {
				id,
				agentId,
				wait,
				cancel: async () => append(`cancelled-${id}`, "x"),
				async *stream() {
					let seen = 0;
					let toolsSeen = 0;
					while (!done) {
						const text = lines(`stream-${id}.txt`);
						for (; seen < text.length; seen++)
							yield { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: JSON.parse(text[seen]) }] } };
						const tools = lines(`tool-${id}.jsonl`);
						for (; toolsSeen < tools.length; toolsSeen++) yield { type: "tool_call", ...JSON.parse(tools[toolsSeen]) };
						await sleep(20);
					}
				},
			};
		},
	};
}

exports.Cursor = {
	me: async (options) => inProcess().me(options),
	models: { list: async (options) => inProcess().models(options) },
};
exports.Agent = {
	create: async (options) => (inProcess() ? inProcess().create(options) : fileAgent(options)),
	resume: async (agentId, options) => (inProcess() ? inProcess().resume(agentId, options) : fileAgent(options, agentId)),
	getRun: async (runId, options) => inProcess().getRun(runId, options),
};
