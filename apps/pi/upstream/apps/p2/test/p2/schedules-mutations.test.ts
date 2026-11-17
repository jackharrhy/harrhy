// Controlled subscription/publication boundaries exercise the production per-schedule mutation queue.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import type { Static } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT, defineFacet, serveKeyed } from "@p2/app/v1";
import { ScheduleStore } from "../../plugins/schedules/contract.ts";
import scheduler from "../../plugins/schedules/server.ts";
import { StimulusSources } from "../../plugins/stimuli/contract.server.ts";
import {
	type SourceEventSchema,
	type StimulusJson,
	type SubscriptionSchema,
	WakeStore,
} from "../../plugins/stimuli/contract.ts";
import { openHostStore } from "../../src/runtime/host-dirs.ts";
import { testHost } from "./helpers.ts";

it("checks queued worker scope after retarget and preserves manual pending bytes across lost publish acknowledgements", async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "p2-schedule-mutations-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const disk = await openHostStore(directory, { outbox: false }, BACKGROUND_CONTEXT);
	t.after(() => disk.close(BACKGROUND_CONTEXT));
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const subscriptions = new Map<string, Static<typeof SubscriptionSchema>>();
	const events = new Map<string, { input: StimulusJson; event: Static<typeof SourceEventSchema> }>();
	let fail = true;
	let commitBeforeFailure = false;
	let failProvision = false;
	const unused = async () => {
		throw new Error("unused");
	};
	const host = await testHost({
		store: disk,
		facets: [
			defineFacet((facet) => {
				serveKeyed(facet, StimulusSources);
				facet.serve(WakeStore, () => ({
					register: unused,
					list: unused,
					cancel: unused,
					reviseSubscription: unused,
					subscriptions: async () => [...subscriptions.values()],
					createSubscription: async (args) => {
						if (args.target.session === "new") {
							entered.resolve();
							await release.promise;
						}
						const row = { ...args, revision: 1, enabled: true, configHash: "test" };
						subscriptions.set(row.id, row);
						if (failProvision) throw new Error("provisioning acknowledgement lost");
						return row;
					},
					enableSubscription: async ({ id, expectedRevision, enabled }) => {
						const row = subscriptions.get(id)!;
						assert.equal(row.revision, expectedRevision);
						const next = { ...row, revision: row.revision + 1, enabled };
						subscriptions.set(id, next);
						return next;
					},
					receipt: async ({ eventId }) => {
						const row = events.get(eventId);
						return row ? { state: "recorded" as const, event: row.event } : { state: "missing" as const };
					},
					publish: async (args) => {
						const previous = events.get(args.eventId);
						if (previous)
							assert.deepEqual(args.event, previous.input, "same identity must retain its original bytes");
						if (fail && !commitBeforeFailure) throw new Error("before recording");
						const sub = subscriptions.get(args.subscriptionId)!;
						const event = previous?.event ?? {
							envelope: {
								delivery: {
									id: args.eventId,
									session: sub.target.session,
									conversation: 1,
									notBefore: 0,
									text: "synthetic",
									intentHash: "test",
								},
								source: { ...args.source, label: "Recurring prompt" },
								subscriptionId: sub.id,
								revision: sub.revision,
								eventId: args.eventId,
								eventHash: "test",
								configHash: "test",
							},
							phase: { kind: "pending" as const },
						};
						events.set(args.eventId, { input: args.event, event });
						if (fail) throw new Error("acknowledgement lost after recording");
						return { state: "recorded" as const, event };
					},
				}));
			}),
			scheduler,
		],
	});
	try {
		await host.root(async (ctx) => {
			const store = await ctx.get(ScheduleStore, {});
			const definition = {
				id: "mutation",
				title: "Boundary test",
				cron: "0 8 * * *",
				timezone: "America/St_Johns",
				text: "Synthetic",
			};
			const original = await store.create({ definition, target: { session: "old", conversation: 1 } }, ctx);
			let clock = Date.now();
			const clockMock = t.mock.method(Date, "now", () => clock);
			const update = store.update(
				{ definition, target: { session: "new", conversation: 1 }, expectedRevision: original.revision },
				ctx,
			);
			await entered.promise;
			clock += 2 * 24 * 60 * 60 * 1000;
			const run = assert.rejects(
				store.run({ id: definition.id, expectedRevision: 3, requestId: "unauthorized", scope: "old" }, ctx),
				/scope/,
			);
			const pause = assert.rejects(
				store.setEnabled({ id: definition.id, expectedRevision: 3, enabled: false, scope: "old" }, ctx),
				/scope/,
			);
			const edit = assert.rejects(
				store.update({ definition, target: original.target, expectedRevision: 3, scope: "old" }, ctx),
				/scope/,
			);
			release.resolve();
			const moved = await update;
			clockMock.mock.restore();
			assert(
				moved.phase.kind === "active" && moved.phase.nextAt > clock,
				"activation selects a future tick after provisioning completes",
			);
			await Promise.all([run, pause, edit]);
			assert.equal(events.size, 0);
			assert.equal(moved.target.session, "new");
			for (const lostAfterCommit of [false, true]) {
				fail = true;
				commitBeforeFailure = lostAfterCommit;
				const requestId = `retry-${lostAfterCommit}`;
				await assert.rejects(store.run({ id: definition.id, expectedRevision: moved.revision, requestId }, ctx));
				const pending = (await store.list({}, ctx))[0]!.pending!;
				assert.equal(pending.eventId, `manual:${requestId}`);
				// Ensure a mistakenly regenerated timestamp cannot coincide with the saved one.
				await new Promise((resolve) => setTimeout(resolve, 5));
				fail = false;
				await store.run({ id: definition.id, expectedRevision: moved.revision, requestId }, ctx);
				const row = (await store.list({}, ctx))[0]!;
				assert.equal(row.pending, undefined);
				assert.deepEqual(row.last!.occurrence, pending);
				assert.deepEqual(row.phase, moved.phase, "manual runs do not move the recurring cursor");
			}
			assert.equal(events.size, 2);
			failProvision = true;
			await assert.rejects(
				store.update(
					{
						definition: { ...definition, text: "Abandoned replacement" },
						target: moved.target,
						expectedRevision: moved.revision,
					},
					ctx,
				),
			);
			failProvision = false;
			const afterFailure = (await store.list({}, ctx))[0]!;
			assert.equal(afterFailure.phase.kind, "paused");
			assert.equal(afterFailure.definition.text, definition.text);
			const recovered = await store.setEnabled(
				{ id: definition.id, expectedRevision: afterFailure.revision, enabled: true },
				ctx,
			);
			assert.equal(
				recovered.phase.kind,
				"active",
				"an orphan replacement cannot prevent resuming the prior definition",
			);
			const paused = await store.setEnabled(
				{ id: definition.id, expectedRevision: recovered.revision, enabled: false },
				ctx,
			);
			await store.setEnabled({ id: definition.id, expectedRevision: paused.revision, enabled: true }, ctx);
			await assert.rejects(
				store.run({ id: definition.id, expectedRevision: moved.revision, requestId: "retry-true" }, ctx),
				/revision/,
			);
			assert.equal(events.size, 2, "a retry captured before replacement cannot publish under a fresh binding");
		});
	} finally {
		release.resolve();
		await host.close();
	}
});
