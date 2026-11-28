import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { cursorAcpSession } from "../../integrations/acp/runtime/cursor.ts";
import { runAcp } from "../../integrations/acp/runtime/runner.ts";

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

function runCursor(scenario: string, model?: string) {
	return runAcp({
		...options,
		args: [fixture, "cursor", scenario],
		signal: new AbortController().signal,
		adapter: cursorAcpSession(scenario === "agent" ? "agent" : scenario === "plan" ? "plan" : "ask", model),
	});
}

test("Cursor ACP negotiates advertised read-only modes and rejects tool and interactive approvals over the common transport", async () => {
	for (const mode of ["ask", "plan"]) {
		assert.equal(await runCursor(mode), "hello from Cursor ACP");
	}
});

test("Cursor ACP agent mode grants one-time native tool requests", async () => {
	assert.equal(await runCursor("agent"), "hello from Cursor ACP");
});

test("Cursor ACP selects the advertised Composer variant and rejects unknown models", async () => {
	assert.equal(await runCursor("composer", "composer-2.5"), "hello from Cursor ACP");
	await assert.rejects(runCursor("composer", "missing-model"), /did not advertise an unambiguous match/);
});

test("Cursor ACP fails closed on missing authentication, an unconfirmed read-only mode, a mode change or ambiguous permissions", async () => {
	await assert.rejects(runCursor("auth-error"), /requires authentication; sign in separately/);
	await assert.rejects(runCursor("missing-mode"), /did not advertise the requested read-only mode/);
	await assert.rejects(runCursor("bad-mode-ack"), /did not confirm the requested read-only mode/);
	await assert.rejects(runCursor("mode-change"), /left the requested read-only mode/);
	await assert.rejects(runCursor("ambiguous-permission"), /did not offer an unambiguous one-time permission rejection/);
});

test("ACP starts with literal argv and no inherited host credentials or overrides", async (t) => {
	const keys = ["P2_DATA_DIR", "GOOGLE_API_KEY", "ANTIGRAVITY_API_KEY", "GEMINI_API_KEY", "CURSOR_API_KEY", "CURSOR_AUTH_TOKEN", "HARRHY_PI_HTTP_PROXY", "NODE_OPTIONS"];
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
