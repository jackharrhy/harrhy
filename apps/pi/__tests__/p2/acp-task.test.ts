import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { Chat } from "../../plugins/chat/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { userPluginsDirectory } from "../../src/runtime/host-dirs.ts";
import { holdIn, startFixture, TEST, until } from "./helpers.ts";

it("delegates from the approved workspace and can restrict trials to one session", { timeout: 90_000 }, async (test) => {
	const workspace = await realpath(await mkdtemp(join(tmpdir(), "p2-acp-task-")));
	test.after(() => rm(workspace, { force: true, recursive: true }));
	const executable = join(workspace, "fake-agent.ts");
	const agent = await readFile(new URL("./fixtures/acp-agent.ts", import.meta.url), "utf8");
	await writeFile(executable, `#!${process.execPath}\n${agent}`, { mode: 0o700 });
	const cursorCommand = join(workspace, "fake-cursor.ts");
	await writeFile(cursorCommand, `#!${process.execPath}\n${agent.replace('const [mode = "acp", argument] = process.argv.slice(2);', 'const mode = "cursor", argument = "composer";')}`, { mode: 0o700 });
	const settings = { HARRHY_PI_ACP_WORKSPACE: workspace, HARRHY_PI_ACP_AGY: executable };
	for (const [name, value] of Object.entries(settings)) {
		const prior = process.env[name];
		process.env[name] = value;
		test.after(() => {
			if (prior === undefined) delete process.env[name];
			else process.env[name] = prior;
		});
	}
	const fixture = await startFixture({ integrations: ["acp"] });
	try {
		const browser = fixture.browser();
		const sessions = await holdIn(browser, Sessions, {}, "owner");
		const check = async (session: string, expected: RegExp, cursorMode?: "ask" | "agent") => {
			const chat = await holdIn(browser, Chat, { session, conversation: 1 }, "participant");
			const args = cursorMode ? { agent: "cursor", mode: cursorMode, model: "composer-2.5", prompt: "Say hello" } : { prompt: "Say hello" };
			await chat.send({ text: `codemode text(await tools.acp_task(${JSON.stringify(args)}));`, requestId: cursorMode ?? "acp-test" }, TEST);
			await until(chat.view, (view) => expected.test(JSON.stringify(view?.entries.flatMap((entry) => entry.model ?? []))), 30_000);
		};
		const other = await sessions.create({ cwd: await realpath(fixture.workspace), title: "Other workspace" }, TEST);
		await check(other.id, /ACP is only enabled from the operator-approved workspace/);
		const approved = await sessions.create({ cwd: workspace, title: "ACP trial" }, TEST);
		await writeFile(join(userPluginsDirectory(fixture.dataDir), "acp", "trial.json"), JSON.stringify({
			command: executable, cursorCommand, workspace, session: approved.id,
		}), { mode: 0o600 });
		const unapproved = await sessions.create({ cwd: workspace, title: "Other session at the same path" }, TEST);
		await check(unapproved.id, /ACP is only enabled in the operator-approved session/);
		await check(approved.id, /Untrusted output from Antigravity CLI.*hello from ACP/);
		await check(approved.id, /Untrusted output from Cursor CLI.*hello from Cursor ACP/, "ask");
		await check(approved.id, /operator has not enabled unsandboxed Cursor ACP agent mode/, "agent");
	} finally {
		await fixture.close();
	}
});
