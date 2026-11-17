// Real recurring source -> persisted stimuli -> native transcript, plus private management and restart boundaries.
import assert from "node:assert/strict";
import { it } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { Schedules } from "../../plugins/schedules/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Sharing } from "../../plugins/sharing/contract.ts";
import { WakeStore } from "../../plugins/stimuli/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { PEER_MESSAGE_ENTRY } from "../../src/runtime/entries.ts";
import { Hosts } from "../../src/runtime/server.ts";
import { clientHost, holdIn, localOwner, poll, startFixture, until } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
it("runs and deduplicates manual prompts, delivers recurrence, scopes management, and preserves pause across restart", async () => {
	const fixture = await startFixture();
	let restarted: Awaited<ReturnType<typeof startServer>> | undefined;
	let browser: ReturnType<typeof clientHost> | undefined;
	try {
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const session = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const other = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const schedules = await holdIn(fixture.browser(), Schedules, {}, "owner");
		const definition = {
			id: "morning",
			title: "Research prompt",
			cron: "0 8 * * *",
			timezone: "America/St_Johns",
			text: "Synthetic research only",
		};
		let row = await schedules.createTarget({ definition, target: { session, conversation: 1 } }, TEST);
		assert.equal(row.phase.kind, "active");
		assert.deepEqual(await schedules.createTarget({ definition, target: row.target }, TEST), row);
		await assert.rejects(
			schedules.createTarget({ definition: { ...definition, text: "conflict" }, target: row.target }, TEST),
		);
		await assert.rejects(
			schedules.createTarget(
				{ definition: { ...definition, id: "bad-timezone", timezone: "Mars/Base" }, target: row.target },
				TEST,
			),
		);
		await assert.rejects(
			schedules.createTarget(
				{ definition: { ...definition, id: "bad-conversation" }, target: { session, conversation: 99999 } },
				TEST,
			),
		);
		const first = await schedules.run(
			{ id: definition.id, expectedRevision: 1, requestId: "same-manual-request" },
			TEST,
		);
		const replay = await schedules.run(
			{ id: definition.id, expectedRevision: 1, requestId: "same-manual-request" },
			TEST,
		);
		assert(first.state !== "missing" && replay.state !== "missing");
		assert.equal(first.event.envelope.delivery.id, replay.event.envelope.delivery.id);
		assert.equal(first.event.envelope.eventId, "manual:same-manual-request");
		const chat = await holdIn(fixture.browser(), Chat, { session, conversation: 1 }, "participant");
		await until(chat.view, (view) => Boolean(view?.entries.some((entry) => entry.kind === PEER_MESSAGE_ENTRY)));
		await poll(async () => (await schedules.receipt({ id: definition.id }, TEST)).state === "admitted");
		assert.equal(chat.view.value!.entries.filter((entry) => entry.kind === PEER_MESSAGE_ENTRY).length, 1);
		assert.deepEqual(
			(await schedules.list({}, TEST))[0]!.phase,
			row.phase,
			"manual runs do not move the recurrence cursor",
		);
		const generation = await fixture.server.host.root(
			async (ctx) => (await ctx.get(Hosts, {})).workers.value[session]!.generation,
			TEST,
		);
		const worker = await holdIn(fixture.as({ kind: "worker", session, generation }), Schedules, {}, "worker");
		assert((await worker.list({}, TEST)).every((item) => item.target.session === session));
		const second = await schedules.createTarget(
			{ definition: { ...definition, id: "other-session" }, target: { session: other, conversation: 1 } },
			TEST,
		);
		await assert.rejects(
			worker.setEnabled({ id: second.definition.id, expectedRevision: second.revision, enabled: false }, TEST),
		);
		await assert.rejects(worker.run({ id: second.definition.id, expectedRevision: 1, requestId: "forbidden" }, TEST));
		await assert.rejects(worker.receipt({ id: second.definition.id }, TEST));
		const stale = fixture.as({ kind: "worker", session, generation: -1 });
		await assert.rejects(
			stale.root(async (ctx) => {
				const ref = await ctx.get(Schedules, {});
				if (ref.variant !== "worker") throw new Error("Expected worker variant");
				await ref.list({}, ctx);
			}, TEST),
		);
		const guest = fixture.as({
			kind: "guest",
			id: "visitor",
			name: "Visitor",
			home: "test",
			sessions: {},
			revision: 1,
		});
		await assert.rejects(guest.root(async (ctx) => ctx.get(Schedules, {}), TEST));
		row = await schedules.setEnabled({ id: definition.id, expectedRevision: row.revision, enabled: false }, TEST);
		assert.equal(row.phase.kind, "paused");
		await assert.rejects(schedules.run({ id: definition.id, expectedRevision: 1, requestId: "paused" }, TEST));
		await assert.rejects(schedules.setEnabled({ id: definition.id, expectedRevision: 1, enabled: true }, TEST));
		const resumed = await schedules.setEnabled(
			{ id: definition.id, expectedRevision: row.revision, enabled: true },
			TEST,
		);
		assert.notEqual(resumed.subscription.id, row.subscription.id);
		assert(resumed.phase.kind === "active" && resumed.phase.nextAt > Date.now());
		const subscriptions = await fixture.server.host.root(
			async (ctx) => (await ctx.get(WakeStore, {})).subscriptions({ session }, ctx),
			TEST,
		);
		assert.equal(subscriptions.find((item) => item.id === row.subscription.id)!.enabled, false);
		row = await schedules.updateTarget(
			{
				definition: { ...definition, cron: "*/2 * * * * *", text: "Synthetic recurring tick" },
				target: row.target,
				expectedRevision: resumed.revision,
			},
			TEST,
		);
		await until(chat.view, (view) =>
			Boolean(
				view?.entries.some(
					(entry) =>
						entry.kind === PEER_MESSAGE_ENTRY && JSON.stringify(entry.data).includes("Synthetic recurring tick"),
				),
			),
		);
		row = await schedules.setEnabled({ id: definition.id, expectedRevision: row.revision, enabled: false }, TEST);
		assert.equal(row.phase.kind, "paused");
		const receipt = await schedules.receipt({ id: definition.id }, TEST);
		assert(receipt.state !== "missing");
		assert.equal(receipt.event.envelope.source.id, "p2.recurring-prompt");
		assert.match(receipt.event.envelope.eventId, /^scheduled:/);
		const sharing = await holdIn(fixture.browser(), Sharing, { session }, "owner");
		await sharing.link({ mode: "view" }, TEST);
		await assert.rejects(
			schedules.setEnabled({ id: definition.id, expectedRevision: row.revision, enabled: true }, TEST),
		);
		sharing.release();
		worker.release();
		chat.release();
		schedules.release();
		sessions.release();
		await fixture.server.close();
		restarted = await startServer({ dataDir: fixture.dataDir, port: 0, fake: true, web: false });
		browser = clientHost(await localOwner(restarted));
		const restored = await holdIn(browser, Schedules, {}, "owner");
		const after = (await restored.list({}, TEST)).find((item) => item.definition.id === definition.id)!;
		assert.equal(after.phase.kind, "paused");
		assert.equal(after.revision, row.revision);
		assert.equal((await restored.receipt({ id: definition.id }, TEST)).state, "admitted");
		restored.release();
	} finally {
		await browser?.close(TEST);
		await restarted?.close();
		await fixture.close();
	}
});
