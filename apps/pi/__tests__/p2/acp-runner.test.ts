import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { runAcp } from "../../integrations/acp/runner.ts";

const fixture = fileURLToPath(new URL("./fixtures/acp-agent.ts", import.meta.url));
const options = {
	command: process.execPath,
	cwd: import.meta.dirname,
	prompt: 'hello\n"ACP"',
};

function run(mode = "acp", argument?: string, signal = new AbortController().signal) {
	return runAcp({ ...options, args: argument === undefined ? [fixture, mode] : [fixture, mode, argument], signal });
}

test("ACP collects only its session's assistant text, denies permissions, and does not implement fs or terminal calls", async () => {
	assert.equal(await run(), "hello from ACP");
});

test("ACP starts with literal argv and no inherited host credentials or overrides", async (t) => {
	const keys = ["P2_DATA_DIR", "GOOGLE_API_KEY", "ANTIGRAVITY_API_KEY", "GEMINI_API_KEY", "HARRHY_PI_HTTP_PROXY", "NODE_OPTIONS"];
	const previous = keys.map((key) => process.env[key]);
	t.after(() => {
		for (const [index, key] of keys.entries()) {
			if (previous[index] === undefined) delete process.env[key];
			else process.env[key] = previous[index];
		}
	});
	for (const key of keys) process.env[key] = "must not reach the ACP child";
	assert.equal(await run("check-env", 'literal ; $(not-a-command) "quoted"'), "hello from ACP");
});

test("ACP rejects incompatible versions, premature EOF, refusals and authentication failures without exposing agent errors", async () => {
	await assert.rejects(run("bad-version"), { message: "ACP agent does not support protocol version 1." });
	await assert.rejects(run("close"), { message: "ACP agent closed stdout before replying to session/prompt." });
	await assert.rejects(run("refusal"), { message: "ACP agent stopped before completing the turn (refusal)." });
	await assert.rejects(run("auth-error"), { message: "ACP agent requires authentication; sign in separately before running it." });
});

test("ACP bounds both unterminated frames and returned assistant text by bytes", async () => {
	await assert.rejects(run("bad-frame"), /protocol frame limit/);
	await assert.rejects(run("overflow"), /assistant text exceeded the output limit/);
});

test("ACP abort notifies the agent and reaps a process that ignores SIGTERM", { timeout: 10_000 }, async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "p2-acp-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const marker = join(dir, "agent");
	const controller = new AbortController();
	t.after(() => controller.abort());
	const cancelled = assert.rejects(run("hang", marker, controller.signal), { name: "AbortError" });
	await Promise.race([
		cancelled.then(() => { throw new Error("ACP agent exited before receiving the prompt"); }),
		(async () => {
			const signal = AbortSignal.timeout(5000);
			while (!existsSync(`${marker}.ready`)) await delay(10, undefined, { signal });
		})(),
	]);
	controller.abort();
	await cancelled;
	assert.equal(await readFile(`${marker}.cancelled`, "utf8"), "yes");
	const pid = Number(await readFile(`${marker}.ready`, "utf8"));
	assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("ACP deadline covers even an agent that never responds to initialize", async (t) => {
	const setTimeout = globalThis.setTimeout;
	t.mock.method(globalThis, "setTimeout", (callback: () => void, ms: number) => setTimeout(callback, ms === 120_000 ? 100 : ms));
	await assert.rejects(run("hang-initialize"), { message: "ACP run timed out." });
});
