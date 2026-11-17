// Explicit attach bootstrap uses existing sessions and preserves navigation across bundle replacement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { VirtualTerminal } from "../../../../packages/tui/test/virtual-terminal.ts";
import { Chat } from "../../plugins/chat/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { SessionTree } from "../../plugins/tree/contract.ts";
import { startTuiClient } from "../../src/hosts/tui-client.ts";
import { holdIn, poll, startFixture } from "./helpers.ts";

test("session target attaches without creation and reload keeps the selected screen", { timeout: 60000 }, async (t) => {
	const fixture = await startFixture();
	t.after(() => fixture.close());
	const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
	const row = await sessions.create({ cwd: fixture.workspace }, BACKGROUND_CONTEXT);
	const chat = await holdIn(fixture.browser(), Chat, { session: row.id, conversation: 1 }, "participant");
	await chat.send({ text: "Branch fixture", requestId: "branch-fixture" }, BACKGROUND_CONTEXT);
	const tree = await holdIn(fixture.browser(), SessionTree, { session: row.id }, "owner");
	const branch = await tree.branch({ conversation: 1, label: "Attach branch" }, BACKGROUND_CONTEXT);
	assert.notEqual(branch.conversation, 1);
	const terminal = new VirtualTerminal(100, 30);
	const client = await startTuiClient({
		terminal,
		url: new URL(`http://127.0.0.1:${fixture.server.port}`),
		credentials: { cookie: fixture.owner.cookie },
		role: "owner",
		session: row.id,
		pollMs: 60000,
		colorQueryMs: 10,
	});
	t.after(() => client.close());
	const snapshot = async () => (await client.snapshot()) as { session?: string; screen: string; conversation: number };
	await poll(async () => (await snapshot()).session === row.id && (await snapshot()).screen === "chat", 15000);
	assert.equal((await snapshot()).conversation, branch.conversation);
	terminal.sendInput("\x12");
	await poll(async () => (await snapshot()).screen === "sessions");
	await client.reload();
	await poll(async () => (await snapshot()).screen === "sessions");
	assert.equal((await snapshot()).session, row.id);
});

test("missing and archived targets show errors without opening a conversation", { timeout: 60000 }, async (t) => {
	const fixture = await startFixture();
	t.after(() => fixture.close());
	const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
	const row = await sessions.create({ cwd: fixture.workspace }, BACKGROUND_CONTEXT);
	await sessions.archive({ id: row.id }, BACKGROUND_CONTEXT);
	for (const [session, error] of [
		[row.id, "is archived"],
		[crypto.randomUUID(), "does not exist"],
	]) {
		const terminal = new VirtualTerminal(120, 30);
		const failures: string[] = [];
		const client = await startTuiClient({
			terminal,
			url: new URL(`http://127.0.0.1:${fixture.server.port}`),
			credentials: { cookie: fixture.owner.cookie },
			role: "owner",
			session,
			onFailure: (message) => failures.push(message),
			pollMs: 60000,
			colorQueryMs: 10,
		});
		t.after(() => client.close());
		await poll(() => failures.some((message) => message.includes(error!)), 15000);
		await client.close();
	}
});
