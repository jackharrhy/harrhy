// Actual code-mode tools refuse recurrence management in a locked private session.
import assert from "node:assert/strict";
import { it } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { Schedules } from "../../plugins/schedules/contract.ts";
import { SessionLock, Sessions } from "../../plugins/sessions/contract.ts";
import { holdIn, startFixture, until } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
it("guards create, update, pause and manual publication through actual locked-session tools", async () => {
	const fixture = await startFixture();
	try {
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const session = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const schedules = await holdIn(fixture.browser(), Schedules, {}, "owner");
		const definition = {
			id: "locked-job",
			title: "Locked boundary",
			cron: "0 8 * * *",
			timezone: "America/St_Johns",
			text: "Synthetic",
		};
		const row = await schedules.createTarget({ definition, target: { session, conversation: 1 } }, TEST);
		const locks = await holdIn(fixture.browser(), SessionLock, {}, "owner");
		await locks.set({ session, lock: { mcp: [], projectMcp: false, instructions: false, capabilities: [] } }, TEST);
		const chat = await holdIn(fixture.browser(), Chat, { session, conversation: 1 }, "participant");
		await chat.send(
			{
				text: `codemode const results = []; const attempt = async (run) => { try { results.push(await run()); } catch (error) { results.push(String(error)); } }; await attempt(() => tools.schedule_create(${JSON.stringify({ ...definition, id: "must-not-exist" })})); await attempt(() => tools.schedule_update(${JSON.stringify({ definition: { ...definition, text: "must not change" }, expectedRevision: row.revision })})); await attempt(() => tools.schedule_set_enabled(${JSON.stringify({ id: definition.id, expectedRevision: row.revision, enabled: false })})); await attempt(() => tools.schedule_run(${JSON.stringify({ id: definition.id, expectedRevision: row.revision })})); return results;`,
				requestId: "locked-schedule-tools",
			},
			TEST,
		);
		await until(
			chat.view,
			(view) => (JSON.stringify(view?.entries).match(/not available in a locked/g)?.length ?? 0) >= 4,
		);
		assert.deepEqual(await schedules.list({}, TEST), [row]);
		assert.deepEqual(await schedules.receipt({ id: definition.id }, TEST), { state: "missing" });
		chat.release();
		locks.release();
		schedules.release();
		sessions.release();
	} finally {
		await fixture.close();
	}
});
