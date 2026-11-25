import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { Chat } from "../../plugins/chat/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { holdIn, startFixture, TEST, until } from "./helpers.ts";

it("delegates from the approved local session and refuses other workspaces", { timeout: 90_000 }, async (test) => {
	const workspace = await realpath(await mkdtemp(join(tmpdir(), "p2-acp-task-")));
	test.after(() => rm(workspace, { force: true, recursive: true }));
	const executable = join(workspace, "fake-agent.ts");
	const agent = await readFile(new URL("./fixtures/acp-agent.ts", import.meta.url), "utf8");
	await writeFile(executable, `#!${process.execPath}\n${agent.replace(/^#![^\n]*\n/, "")}`, { mode: 0o700 });
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
		for (const [cwd, expected] of [
			[workspace, /Untrusted output from Antigravity CLI.*hello from ACP/],
			[await realpath(fixture.workspace), /ACP is only enabled from the operator-approved workspace/],
		] as const) {
			const session = await sessions.create({ cwd, title: "ACP tool proof" }, TEST);
			const chat = await holdIn(browser, Chat, { session: session.id, conversation: 1 }, "participant");
			await chat.send({ text: 'codemode text(await tools.acp_task({prompt: "Say hello"}));', requestId: "acp-test" }, TEST);
			await until(chat.view, (view) => expected.test(JSON.stringify(view?.entries.flatMap((entry) => entry.model ?? []))), 30_000);
		}
	} finally {
		await fixture.close();
	}
});
