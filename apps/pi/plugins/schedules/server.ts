// Persistent recurrence cursors publish immutable occurrences through stimuli, never directly to a worker.
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { obj, type Static } from "@earendil-works/pi-schema";
import {
	type Ctx,
	contribute,
	defineFacet,
	defineState,
	forbidden,
	isOwner,
	isWorker,
	record,
	signalOf,
} from "@p2/app/v1";
import { processLogs } from "@p2/app/v1/node";
import { Hosts, serverOf } from "@p2/app/v1/server";
import { bindStimulusPublisher, StimulusSources, sourceKey } from "../stimuli/contract.server.ts";
import { type SubscriptionSchema, WakeStore } from "../stimuli/contract.ts";
import { type DefinitionSchema, ScheduleSchema, ScheduleStore, Schedules } from "./contract.ts";
import { dueOccurrence, nextOccurrence } from "./recurrence.ts";
import { ScheduleSource } from "./source.ts";

type Schedule = Static<typeof ScheduleSchema>;
type Definition = Static<typeof DefinitionSchema>;
type Subscription = Static<typeof SubscriptionSchema>;
const Saved = defineState("p2.schedules", {
	version: 1,
	schema: obj({ schedules: record(ScheduleSchema) }),
	initial: () => ({ schedules: {} }),
	persist: true,
	checkpointWhen: (_value, _ops, info) => info.deltasSinceBase >= 100,
});

export default defineFacet((host) => {
	contribute(host, "p2.schedules.source", (self) => {
		self.contribute(StimulusSources, { [sourceKey(ScheduleSource)]: ScheduleSource });
	});
	host.serve(ScheduleStore, (_params, self) => {
		const saved = self.state(Saved);
		const stimuli = self.get(WakeStore, {});
		const server = serverOf(self);
		const queues = new Map<string, Promise<unknown>>();
		const active = new Map<string, Promise<void>>();
		const retry = new Map<string, { at: number; delay: number }>();
		const checked = new Set<string>();
		let changed = () => {};
		self.on(saved, async () => changed());
		const of = (id: string, scope?: string): Schedule => {
			const row = saved.value.schedules[id];
			if (scope !== undefined && row?.target.session !== scope) throw forbidden("Wrong schedule scope");
			if (!row) throw new Error("No such schedule");
			return row;
		};
		// Mutations of one schedule serialize with its publisher; unrelated schedules never wait for it.
		const exclusive = <T>(id: string, run: () => Promise<T>): Promise<T> => {
			const prior = queues.get(id) ?? Promise.resolve();
			const task = prior.then(run, run);
			queues.set(id, task);
			const release = () => {
				if (queues.get(id) === task) queues.delete(id);
			};
			task.then(release, release);
			return task;
		};
		const provision = async (definition: Definition, target: Schedule["target"], revision: number, ctx: Ctx) => {
			const intent = createHash("sha256")
				.update(
					JSON.stringify([
						definition.title,
						definition.cron,
						definition.timezone,
						definition.text,
						target.session,
						target.conversation,
					]),
				)
				.digest("hex");
			const id = `schedule:${JSON.stringify([definition.id, revision, intent])}`;
			const config = { id: definition.id, title: definition.title, text: definition.text };
			const existing = (await stimuli.subscriptions({}, ctx)).find((row) => row.id === id);
			if (existing) {
				// A prior create may have committed before its caller lost the acknowledgement.
				if (
					sourceKey(existing.source) !== sourceKey(ScheduleSource) ||
					!existing.enabled ||
					existing.target.session !== target.session ||
					existing.target.conversation !== target.conversation ||
					!isDeepStrictEqual(existing.config, config)
				)
					throw new Error("Schedule subscription conflict");
				return stimuli.enableSubscription(
					{ id: existing.id, expectedRevision: existing.revision, enabled: true },
					ctx,
				);
			}
			return stimuli.createSubscription(
				{ id, source: { id: ScheduleSource.id, version: ScheduleSource.version }, target, config },
				ctx,
			);
		};
		const retire = async (subscription: Subscription, ctx: Ctx) => {
			const current = (await stimuli.subscriptions({}, ctx)).find((row) => row.id === subscription.id);
			if (current?.enabled && current.revision === subscription.revision)
				await stimuli.enableSubscription(
					{ id: current.id, expectedRevision: current.revision, enabled: false },
					ctx,
				);
		};
		const pause = async (id: string, ctx: Ctx) => {
			await retire(of(id).subscription, ctx);
			await saved.change((draft) => {
				const row = draft.schedules[id]!;
				if (row.phase.kind === "paused") return;
				row.phase = { kind: "paused" };
				row.revision++;
				if (row.pending) row.last = { occurrence: row.pending, subscription: row.subscription };
				delete row.pending;
				delete row.lastError;
			}, ctx);
			return of(id);
		};
		const publishPending = async (id: string, ctx: Ctx) => {
			const row = of(id);
			const pending = row.pending;
			if (!pending) throw new Error("No pending occurrence");
			const result = await bindStimulusPublisher(stimuli, ScheduleSource, row.subscription).publish(
				{
					eventId: pending.eventId,
					event: { at: pending.at, kind: pending.kind },
				},
				ctx,
			);
			// The durable outbox acknowledgement is the cursor checkpoint, not native/business completion.
			await saved.change((draft) => {
				const current = draft.schedules[id]!;
				current.last = { occurrence: pending, subscription: row.subscription };
				delete current.pending;
				delete current.lastError;
				if (pending.kind === "scheduled" && current.phase.kind === "active")
					current.phase.nextAt = nextOccurrence(current.definition, Math.max(pending.at, Date.now()));
			}, ctx);
			return result;
		};
		const reconcile = async (id: string, ctx: Ctx) => {
			let row = of(id);
			if (row.phase.kind !== "active") return;
			const binding = (await stimuli.subscriptions({}, ctx)).find((each) => each.id === row.subscription.id);
			if (!binding?.enabled || binding.revision !== row.subscription.revision) {
				// Recovery of a pause which committed in stimuli before the schedule checkpoint.
				await pause(id, ctx);
				checked.add(id);
				return;
			}
			checked.add(id);
			if (!row.pending) {
				const at = dueOccurrence(row.definition, row.phase.nextAt, Date.now());
				if (at === undefined) return;
				await saved.change((draft) => {
					draft.schedules[id]!.pending = {
						kind: "scheduled",
						at,
						eventId: `scheduled:${new Date(at).toISOString()}`,
					};
				}, ctx);
				row = of(id);
			}
			await publishPending(id, ctx);
		};
		self.onLive(async (ctx) => {
			const signal = signalOf(ctx);
			let timer: ReturnType<typeof setTimeout> | undefined;
			let wake = () => {};
			changed = () => wake();
			const abort = () => wake();
			signal.addEventListener("abort", abort);
			try {
				while (!signal.aborted) {
					let next = Infinity;
					for (const row of Object.values(saved.value.schedules)) {
						const id = row.definition.id;
						if (row.phase.kind !== "active" || active.has(id)) continue;
						const at = Math.max(!checked.has(id) || row.pending ? 0 : row.phase.nextAt, retry.get(id)?.at ?? 0);
						if (at > Date.now()) {
							next = Math.min(next, at);
							continue;
						}
						const attempt = server()
							.root((call) => exclusive(id, () => reconcile(id, call)), ctx)
							.catch(async (error: unknown) => {
								if (signal.aborted) return;
								const delay = Math.min((retry.get(id)?.delay ?? 500) * 2, 60_000);
								retry.set(id, { at: Date.now() + delay, delay });
								await saved.change((draft) => {
									draft.schedules[id]!.lastError = error instanceof Error ? error.message : String(error);
								}, ctx);
							})
							.catch(() => {
								if (!signal.aborted)
									processLogs.append("schedules", "error", "Could not persist schedule publication error");
							})
							.finally(() => {
								active.delete(id);
								changed();
							});
						active.set(id, attempt);
					}
					await new Promise<void>((resolve) => {
						wake = resolve;
						if (signal.aborted) resolve();
						else if (next !== Infinity)
							timer = setTimeout(resolve, Math.min(Math.max(0, next - Date.now()), 2_147_483_647));
					});
					clearTimeout(timer);
				}
			} finally {
				changed = () => {};
				clearTimeout(timer);
				signal.removeEventListener("abort", abort);
				await Promise.allSettled(active.values());
			}
		});
		return {
			create: ({ definition, target }, ctx) =>
				exclusive(definition.id, async () => {
					const previous = saved.value.schedules[definition.id];
					if (previous) {
						if (
							!isDeepStrictEqual(previous.definition, definition) ||
							!isDeepStrictEqual(previous.target, target)
						)
							throw new Error("Schedule already exists with different intent");
						return previous;
					}
					nextOccurrence(definition, Date.now());
					const subscription = await provision(definition, target, 1, ctx);
					await saved.change((draft) => {
						draft.schedules[definition.id] = {
							definition,
							target,
							revision: 1,
							subscription,
							phase: { kind: "active", nextAt: nextOccurrence(definition, Date.now()) },
						};
					}, ctx);
					return of(definition.id);
				}),
			update: ({ definition, target, expectedRevision, scope }, ctx) =>
				exclusive(definition.id, async () => {
					const row = of(definition.id, scope);
					if (row.revision !== expectedRevision) throw new Error("Schedule revision conflict");
					nextOccurrence(definition, Date.now());
					await pause(definition.id, ctx);
					const revision = of(definition.id).revision + 1;
					const subscription = await provision(definition, target, revision, ctx);
					await saved.change((draft) => {
						draft.schedules[definition.id] = {
							...draft.schedules[definition.id]!,
							definition,
							target,
							revision,
							subscription,
							phase: { kind: "active", nextAt: nextOccurrence(definition, Date.now()) },
						};
					}, ctx);
					return of(definition.id);
				}),
			setEnabled: ({ id, expectedRevision, enabled, scope }, ctx) =>
				exclusive(id, async () => {
					const row = of(id, scope);
					if (row.revision !== expectedRevision) throw new Error("Schedule revision conflict");
					if (!enabled) return pause(id, ctx);
					if (row.phase.kind === "active") {
						const binding = (await stimuli.subscriptions({}, ctx)).find(
							(each) => each.id === row.subscription.id,
						);
						if (binding?.enabled && binding.revision === row.subscription.revision) return row;
						return pause(id, ctx);
					}
					nextOccurrence(row.definition, Date.now());
					const revision = row.revision + 1;
					const subscription = await provision(row.definition, row.target, revision, ctx);
					await saved.change((draft) => {
						const current = draft.schedules[id]!;
						current.revision = revision;
						current.subscription = subscription;
						current.phase = { kind: "active", nextAt: nextOccurrence(row.definition, Date.now()) };
						delete current.lastError;
					}, ctx);
					return of(id);
				}),
			list: async ({ session }) =>
				Object.values(saved.value.schedules).filter(
					(row) => session === undefined || row.target.session === session,
				),
			run: ({ id, requestId, expectedRevision, scope }, ctx) =>
				exclusive(id, async () => {
					const row = of(id, scope);
					if (row.revision !== expectedRevision) throw new Error("Schedule revision conflict");
					if (row.phase.kind !== "active") throw new Error("Resume the schedule before running it");
					const publisher = bindStimulusPublisher(stimuli, ScheduleSource, row.subscription);
					const eventId = `manual:${requestId}`;
					if (row.pending?.eventId === eventId) return publishPending(id, ctx);
					const previous = await publisher.receipt({ eventId }, ctx);
					if (previous.state !== "missing") return previous;
					if (row.pending) await publishPending(id, ctx);
					await saved.change((draft) => {
						draft.schedules[id]!.pending = { kind: "manual", at: Date.now(), eventId };
					}, ctx);
					return publishPending(id, ctx);
				}),
			receipt: async ({ id, scope }, ctx) => {
				const row = of(id, scope);
				const occurrence = row.pending ?? row.last?.occurrence;
				const subscription = row.pending ? row.subscription : row.last?.subscription;
				return occurrence && subscription
					? bindStimulusPublisher(stimuli, ScheduleSource, subscription).receipt(
							{ eventId: occurrence.eventId },
							ctx,
						)
					: { state: "missing" as const };
			},
		};
	});
	host.serve(Schedules, (_params, principal, self) => {
		const store = self.get(ScheduleStore, {});
		if (isOwner(principal))
			return {
				variant: "owner",
				members: {
					createTarget: (args, ctx) => store.create(args, ctx),
					updateTarget: (args, ctx) => store.update(args, ctx),
					setEnabled: (args, ctx) => store.setEnabled(args, ctx),
					list: (_args, ctx) => store.list({}, ctx),
					run: (args, ctx) => store.run(args, ctx),
					receipt: (args, ctx) => store.receipt(args, ctx),
				},
			};
		if (!isWorker(principal)) throw forbidden("Schedules are private");
		const hosts = self.get(Hosts, {});
		const current = () => {
			const worker = hosts.workers.value[principal.session];
			if (!worker?.running || worker.generation !== principal.generation) throw forbidden("Stale worker");
		};
		return {
			variant: "worker",
			members: {
				create: async ({ conversation, definition }, ctx) => {
					current();
					return store.create({ definition, target: { session: principal.session, conversation } }, ctx);
				},
				update: async ({ conversation, definition, expectedRevision }, ctx) => {
					current();
					return store.update(
						{
							definition,
							target: { session: principal.session, conversation },
							expectedRevision,
							scope: principal.session,
						},
						ctx,
					);
				},
				setEnabled: async (args, ctx) => {
					current();
					return store.setEnabled({ ...args, scope: principal.session }, ctx);
				},
				list: async (_args, ctx) => {
					current();
					return store.list({ session: principal.session }, ctx);
				},
				run: async (args, ctx) => {
					current();
					return store.run({ ...args, scope: principal.session }, ctx);
				},
				receipt: async (args, ctx) => {
					current();
					return store.receipt({ ...args, scope: principal.session }, ctx);
				},
			},
		};
	});
});
