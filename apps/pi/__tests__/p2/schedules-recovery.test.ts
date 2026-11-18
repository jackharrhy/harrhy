// Persisted crash images at publication/cursor boundaries exercise the real scheduler, outbox and native worker.
import assert from "node:assert/strict";
import { join } from "node:path";
import { it } from "node:test";
import { obj, type Static } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT, defineFacet, defineState, record } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { ScheduleSchema, ScheduleStore, Schedules } from "../../plugins/schedules/contract.ts";
import { dueOccurrence, nextOccurrence } from "../../plugins/schedules/recurrence.ts";
import { ScheduleSource } from "../../plugins/schedules/source.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { bindStimulusPublisher } from "../../plugins/stimuli/contract.server.ts";
import { WakeStore } from "../../plugins/stimuli/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { PEER_MESSAGE_ENTRY } from "../../src/runtime/entries.ts";
import { openHostStore } from "../../src/runtime/host-dirs.ts";
import { clientHost, holdIn, localOwner, poll, startFixture, testHost, until } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
const State = defineState("p2.schedules", {
	version: 1,
	schema: obj({ schedules: record(ScheduleSchema) }),
	initial: () => ({ schedules: {} }),
	persist: true,
	checkpointWhen: () => true,
});

it("replays a recorded pending occurrence after restart and collapses an unselected overdue backlog to one latest tick", async () => {
	const fixture = await startFixture();
	let restarted: Awaited<ReturnType<typeof startServer>> | undefined;
	let browser: ReturnType<typeof clientHost> | undefined;
	try {
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const session = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const schedules = await holdIn(fixture.browser(), Schedules, {}, "owner");
		const definition = {
			id: "pending",
			title: "Crash recovery",
			cron: "0 8 * * *",
			timezone: "America/St_Johns",
			text: "Synthetic persisted occurrence",
		};
		const pending = await schedules.createTarget({ definition, target: { session, conversation: 1 } }, TEST);
		const catchup = await schedules.createTarget(
			{ definition: { ...definition, id: "catchup", text: "Synthetic single catch-up" }, target: pending.target },
			TEST,
		);
		const newer = await schedules.createTarget(
			{
				definition: { ...definition, id: "newer-binding", text: "Must not retire newer binding" },
				target: pending.target,
			},
			TEST,
		);
		const futureDisabled = await schedules.createTarget(
			{
				definition: { ...definition, id: "future-disabled", text: "Must pause before due" },
				target: pending.target,
			},
			TEST,
		);
		const pausedGap = await schedules.createTarget(
			{ definition: { ...definition, id: "pause-gap", text: "Must not fire" }, target: pending.target },
			TEST,
		);
		await fixture.server.host.root(
			async (ctx) =>
				(await ctx.get(WakeStore, {})).enableSubscription(
					{ id: pausedGap.subscription.id, expectedRevision: 1, enabled: false },
					ctx,
				),
			TEST,
		);
		await fixture.server.host.root(async (ctx) => {
			const store = await ctx.get(WakeStore, {});
			await store.enableSubscription(
				{ id: futureDisabled.subscription.id, expectedRevision: 1, enabled: false },
				ctx,
			);
			await store.reviseSubscription(
				{
					id: newer.subscription.id,
					expectedRevision: 1,
					target: newer.target,
					config: { id: newer.definition.id, title: "Independent replacement", text: "New intent" },
				},
				ctx,
			);
		}, TEST);
		const now = Date.now();
		const oldAt = now - 7 * 24 * 60 * 60 * 1000;
		const occurrence = {
			kind: "scheduled" as const,
			at: oldAt,
			eventId: `scheduled:${new Date(oldAt).toISOString()}`,
		};
		const recorded = await fixture.server.host.root(
			async (ctx) =>
				bindStimulusPublisher(await ctx.get(WakeStore, {}), ScheduleSource, pending.subscription).publish(
					{ eventId: occurrence.eventId, event: { at: oldAt, kind: "scheduled" } },
					ctx,
				),
			TEST,
		);
		assert(recorded.state !== "missing");
		const image: Record<string, Static<typeof ScheduleSchema>> = {
			pending: { ...pending, phase: { kind: "active", nextAt: oldAt }, pending: occurrence },
			catchup: { ...catchup, phase: { kind: "active", nextAt: oldAt } },
			"pause-gap": { ...pausedGap, phase: { kind: "active", nextAt: oldAt } },
			"future-disabled": futureDisabled,
			"newer-binding": newer,
		};
		schedules.release();
		sessions.release();
		await fixture.server.close();
		// The worker/server are stopped. Write the exact state image left by a crash after publish ACK loss,
		// before the recurrence cursor checkpoints. The immutable stimuli event was recorded by production code.
		const store = await openHostStore(join(fixture.dataDir, "server"), { outbox: false }, TEST);
		const seeder = await testHost({
			store,
			facets: [
				defineFacet((host) =>
					host.serve(ScheduleStore, (_params, self) => {
						const saved = self.state(State);
						return {
							create: async () => {
								throw new Error("unused");
							},
							update: async () => {
								throw new Error("unused");
							},
							setEnabled: async () => {
								throw new Error("unused");
							},
							run: async () => {
								throw new Error("unused");
							},
							receipt: async () => {
								throw new Error("unused");
							},
							list: async (_args, ctx) => {
								await saved.change((draft) => {
									draft.schedules = image;
								}, ctx);
								return Object.values(image);
							},
						};
					}),
				),
			],
		});
		try {
			await seeder.root(async (ctx) => (await ctx.get(ScheduleStore, {})).list({}, ctx));
		} finally {
			await seeder.close();
			await store.close(TEST);
		}
		restarted = await startServer({ dataDir: fixture.dataDir, port: 0, fake: true, web: false });
		browser = clientHost(await localOwner(restarted));
		const restored = await holdIn(browser, Schedules, {}, "owner");
		try {
			await poll(async () => {
				const rows = await restored.list({}, TEST);
				if (rows.some((row) => row.lastError)) throw new Error(JSON.stringify(rows));
				return rows.every(
					(row) => row.phase.kind === "paused" || (row.last !== undefined && row.pending === undefined),
				);
			});
		} catch (error) {
			throw new Error(JSON.stringify(await restored.list({}, TEST)), { cause: error });
		}
		const rows = await restored.list({}, TEST);
		const replayed = rows.find((row) => row.definition.id === "pending")!;
		const caught = rows.find((row) => row.definition.id === "catchup")!;
		assert.equal(rows.find((row) => row.definition.id === "future-disabled")!.phase.kind, "paused");
		assert.equal(rows.find((row) => row.definition.id === "newer-binding")!.phase.kind, "paused");
		await restarted.host.root(async (ctx) => {
			const binding = (await (await ctx.get(WakeStore, {})).subscriptions({}, ctx)).find(
				(row) => row.id === newer.subscription.id,
			)!;
			assert.equal(binding.revision, 2);
			assert.equal(binding.enabled, true, "recovery never disables an independently revised binding");
		}, TEST);
		assert.equal(
			rows.find((row) => row.definition.id === "pause-gap")!.phase.kind,
			"paused",
			"a disabled binding is never re-enabled after pause checkpoint loss",
		);
		assert.deepEqual(replayed.last!.occurrence, occurrence, "a saved pending ID wins over selecting a new catch-up");
		assert.equal(caught.last!.occurrence.at, dueOccurrence(definition, oldAt, now));
		assert(replayed.phase.kind === "active" && replayed.phase.nextAt === nextOccurrence(definition, Date.now()));
		assert(caught.phase.kind === "active" && caught.phase.nextAt > Date.now());
		const chat = await holdIn(browser, Chat, { session, conversation: 1 }, "participant");
		await until(
			chat.view,
			(view) => (view?.entries.filter((entry) => entry.kind === PEER_MESSAGE_ENTRY).length ?? 0) >= 2,
		);
		await poll(
			async () =>
				(await restored.receipt({ id: "pending" }, TEST)).state === "admitted" &&
				(await restored.receipt({ id: "catchup" }, TEST)).state === "admitted",
		);
		const native = chat.view.value!.entries.filter((entry) => entry.kind === PEER_MESSAGE_ENTRY);
		assert.equal(native.length, 2, "one pending replay plus one catch-up, not seven days of input");
		const receipt = await restored.receipt({ id: "pending" }, TEST);
		assert(receipt.state !== "missing");
		assert.deepEqual(receipt.event.envelope, recorded.event.envelope);
		chat.release();
		restored.release();
	} finally {
		await browser?.close(TEST);
		await restarted?.close();
		await fixture.close();
	}
});
