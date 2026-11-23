// One persisted outbox for one-shot wakes and authorized source events, reconciled against native receipts.
import { createHash } from "node:crypto";
import { type Static } from "@earendil-works/pi-schema";
import { formats } from "@earendil-works/pi-schema/formats";
import {
	awaitWithContext,
	type Ctx,
	defineFacet,
	forbidden,
	isChordError,
	isOwner,
	isWorker,
	serveKeyed,
	signalOf,
	until,
} from "@p2/app/v1";
import { processLogs } from "@p2/app/v1/node";
import { Hosts, serverOf, WorkerInitValues } from "@p2/app/v1/server";
import { Catalog } from "../sessions/contract.ts";
import { addressedMethods, findTarget, serveAddressed, mayDeliver } from "./addressed-server.ts";
import { Saved } from "./saved.ts";
import { StimulusSources, sourceKey } from "./contract.server.ts";
import {
	AddressedPolicies, AddressedWorker,
	type EventReadbackSchema,
	type SourceEventSchema,
	type StimulusJson,
	StimulusWorker,
	Subscriptions,
	WakeSchema,
	WakeStore,
	Wakes,
} from "./contract.ts";

type Wake = Static<typeof WakeSchema>;
type SourceEvent = Static<typeof SourceEventSchema>;
function readback(event: SourceEvent): Static<typeof EventReadbackSchema> {
	return {
		state:
			event.phase.kind === "pending" || event.phase.kind === "uncertain"
				? "unknown"
				: event.phase.kind === "admitted" || event.phase.kind === "settled"
					? "admitted"
					: "recorded",
		event,
	};
}
function canonical(value: StimulusJson): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	return `{${Object.keys(value)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`)
		.join(",")}}`;
}
function digest(value: StimulusJson): string {
	return createHash("sha256").update(canonical(value)).digest("hex");
}
function eventId(binding: {
	source: { id: string; version: number };
	subscriptionId: string;
	revision: number;
	eventId: string;
}): string {
	return `source:${JSON.stringify([binding.source.id, binding.source.version, binding.subscriptionId, binding.revision, binding.eventId])}`;
}

export default defineFacet((host) => {
	serveAddressed(host);
	serveKeyed(host, StimulusSources);
	host.serve(
		WakeStore,
		(_params, self) => {
			const saved = self.state(Saved);
			const sources = self.registry(StimulusSources);
			const policies = self.registry(AddressedPolicies);
			const rowFor = (id: string): Wake => {
				const timer = saved.value.wakes[id] ?? saved.value.addressed[id];
				if (timer) return timer;
				const event = saved.value.events[id]!;
				return {
					delivery: event.envelope.delivery,
					phase: event.phase,
					...(event.lastError === undefined ? {} : { lastError: event.lastError }),
				};
			};
			const rows = () => [
				...Object.values(saved.value.wakes),
				...Object.values(saved.value.addressed),
				...Object.values(saved.value.events).map((event) => ({
					delivery: event.envelope.delivery,
					phase: event.phase,
				})),
			];
			const server = serverOf(self);
			const catalog = self.get(Catalog, {});
			const startValues = self.registry(WorkerInitValues);
			const startReady = self.derive([startValues], ([values]) => values.has("session"));
			const active = new Map<string, Promise<void>>();
			const retry = new Map<string, { at: number; delay: number }>();
			let changed = () => {};
			self.on(saved, async () => changed());
			self.on(policies, async () => changed());
			self.on(sources, async () => {
				retry.clear();
				changed();
			});
			const openTarget = (session: string) => {
				const target = catalog.sessions.value.find((row) => row.id === session);
				if (!target || target.archivedAt !== null) throw forbidden("Stimuli require an unarchived session");
			};
			const validateTarget = async (target: { session: string; conversation: number }, ctx: Ctx) => {
				openTarget(target.session);
				await until(startReady, (ready) => ready, ctx);
				const worker = await awaitWithContext(ctx.get(StimulusWorker, { session: target.session }), ctx);
				await worker.validateTarget({ conversation: target.conversation }, ctx);
			};
			const declaration = (source: { id: string; version: number }) => {
				const found = sources.value.get(sourceKey(source));
				if (!found) throw new Error("Stimulus source unavailable");
				return found;
			};
			const retire = (event: SourceEvent) => {
				if (event.phase.kind === "scheduled") event.phase = { kind: "closed", reason: "cancelled" };
				else if (event.phase.kind === "pending" || event.phase.kind === "uncertain")
					event.phase = { kind: "uncertain", policy: "readback-only" };
			};
			const blockUnavailable = async (ctx: Ctx) => {
				await saved.change((draft) => {
					for (const id of [...Object.keys(draft.wakes), ...Object.keys(draft.events), ...Object.keys(draft.addressed)]) {
						const row = draft.wakes[id] ?? draft.addressed[id] ?? draft.events[id]!;
						const delivery = draft.wakes[id]?.delivery ?? draft.addressed[id]?.delivery ?? draft.events[id]!.envelope.delivery;
						const target = catalog.sessions.value.find((session) => session.id === delivery.session);
						if (draft.addressed[id] && !target) continue; // The sidebar view is bounded, not an absence proof.
						if (!target || target.archivedAt === null) continue;
						if (row.phase.kind === "scheduled") row.phase = { kind: "closed", reason: "blocked" };
						else if (row.phase.kind === "pending" || row.phase.kind === "uncertain")
							row.phase = { kind: "uncertain", policy: "readback-only" };
					}
				}, ctx);
				changed();
			};
			self.on(catalog.sessions, async (_change, ctx) => blockUnavailable(ctx));
			const phase = async (id: string, next: Wake["phase"], ctx: Ctx) => {
				await saved.change((draft) => {
					const row = draft.wakes[id] ?? draft.addressed[id] ?? draft.events[id]!;
					row.phase = next;
					delete row.lastError;
				}, ctx);
			};
			const reconcile = async (id: string, ctx: Ctx) => {
				let row = rowFor(id);
				const session = row.delivery.session;
				const addressed = saved.value.addressed[id];
				const target = addressed ? await findTarget(catalog, session, ctx) : await catalog.get({ id: session }, ctx);
				if (target?.archivedAt !== null) {
					if (addressed && row.phase.kind === "scheduled") await phase(id, { kind: "closed", reason: "blocked" }, ctx);
					return;
				}
				const unavailable = async () =>
					addressed !== undefined && !mayDeliver(addressed, policies.value.get(addressed.peer));
				if (row.phase.kind === "scheduled" && await unavailable()) {
					await phase(id, { kind: "closed", reason: "blocked" }, ctx);
					return;
				}
				// Persisted overdue rows can run while plugins are still activating at server startup.
				await until(startReady, (ready) => ready, ctx);
				const worker = await awaitWithContext(ctx.get(StimulusWorker, { session }), ctx);
				if ((await catalog.get({ id: session }, ctx)).archivedAt !== null) return;
				row = rowFor(id);
				if (row.phase.kind === "closed" || row.phase.kind === "settled") return;
				const status = await worker.status({ id, intentHash: row.delivery.intentHash }, ctx);
				if (status.state === "conflict") throw new Error("Conflicting native wake receipt");
				if (status.state !== "missing") {
					await phase(
						id,
						!addressed && (status.state === "done" || status.state === "unanswered")
							? { kind: "settled", receipt: status.receipt, outcome: status.state }
							: { kind: "admitted", receipt: status.receipt },
						ctx,
					);
					return;
				}
				row = rowFor(id);
				if (row.phase.kind === "uncertain" && row.phase.policy === "readback-only") return;
				if (row.phase.kind === "admitted") throw new Error("Native wake receipt disappeared");
				if (row.phase.kind === "closed" || row.phase.kind === "settled") return;
				if (await unavailable()) {
					await phase(
						id,
						row.phase.kind === "scheduled"
							? { kind: "closed", reason: "blocked" }
							: { kind: "uncertain", policy: "readback-only" },
						ctx,
					);
					return;
				}
				const source = saved.value.events[id];
				if (source && !sources.value.has(sourceKey(source.envelope.source))) return;
				// Persist before RPC. Cancellation after this point cannot claim to undo admission.
				await saved.change((draft) => {
					const current = draft.wakes[id] ?? draft.addressed[id] ?? draft.events[id]!;
					if (
						current.phase.kind === "scheduled" ||
						(current.phase.kind === "uncertain" && current.phase.policy === "retry") ||
						current.phase.kind === "pending"
					)
						current.phase = { kind: "pending" };
				}, ctx);
				row = rowFor(id);
				if (row.phase.kind !== "pending") return;
				try {
					const source = saved.value.events[id];
					const result = addressed
						? await (await ctx.get(AddressedWorker, { session })).admit({
							delivery: row.delivery, peer: addressed.peer, label: addressed.label,
						}, ctx)
						: source
						? await worker.admitSource(source.envelope, ctx)
						: await worker.admit(row.delivery, ctx);
					if (result.state === "conflict") throw new Error("Conflicting wake intent");
					await phase(id, { kind: "admitted", receipt: result }, ctx);
				} catch (error) {
					const current = rowFor(id).phase;
					await phase(
						id,
						{
							kind: "uncertain",
							policy: isChordError(error, "forbidden")
								? "readback-only"
								: current.kind === "uncertain"
									? current.policy
									: "retry",
						},
						ctx,
					);
					throw error;
				}
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
						const now = Date.now();
						let next = Infinity;
						const occupied = new Set(active.keys());
						for (const row of rows().sort(
							(a, b) =>
								Number(a.phase.kind === "scheduled") - Number(b.phase.kind === "scheduled") ||
								a.delivery.notBefore - b.delivery.notBefore,
						)) {
							const { id, session, notBefore } = row.delivery;
							if (row.phase.kind === "closed" || row.phase.kind === "settled" || occupied.has(session)) continue;
							const source = saved.value.events[id];
							const addressed = saved.value.addressed[id];
							if (addressed && row.phase.kind === "admitted") continue;
							if (row.phase.kind === "scheduled" && addressed && !policies.value.has(addressed.peer)) continue;
							if (
								row.phase.kind === "scheduled" &&
								source &&
								!sources.value.has(sourceKey(source.envelope.source))
							)
								continue;
							const target = catalog.sessions.value.find((entry) => entry.id === session);
							if (target?.archivedAt != null || (!addressed && !target)) continue;
							const at = Math.max(notBefore, retry.get(id)?.at ?? 0);
							if (at > now) {
								if (row.phase.kind !== "scheduled" &&
									!(addressed && row.phase.kind === "uncertain" && row.phase.policy === "readback-only"))
									occupied.add(session);
								next = Math.min(next, at);
								continue;
							}
							occupied.add(session);
							// Independent targets do not wait for a stuck worker. The host context cancels every outstanding call.
							const attempt = server()
								.root((attemptCtx) => reconcile(id, attemptCtx), ctx)
								.catch(async (error: unknown) => {
									if (signal.aborted) return;
									await saved.change((draft) => {
										(draft.wakes[id] ?? draft.addressed[id] ?? draft.events[id]!).lastError =
											error instanceof Error ? error.message : String(error);
									}, ctx);
								})
								.catch(() => {
									if (!signal.aborted)
										processLogs.append("stimuli", "error", "Could not persist wake reconciliation error");
								})
								.finally(() => {
									active.delete(session);
									// Back off recovery/status reads; this is not an admission deadline or an expiry.
									const delay = Math.min((retry.get(id)?.delay ?? 500) * 2, 60_000);
									retry.set(id, { at: Date.now() + delay, delay });
									changed();
								});
							active.set(session, attempt);
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
				...addressedMethods(self, saved),
				createSubscription: async (args, ctx) => {
					declaration(args.source).validateConfig(args.config);
					if (Buffer.byteLength(canonical(args.config)) > 32768)
						throw new Error("Stimulus configuration exceeds 32768 bytes");
					await validateTarget(args.target, ctx);
					const configHash = digest(args.config);
					await saved.change((draft) => {
						if (draft.subscriptions[args.id]) throw new Error("Subscription already exists");
						openTarget(args.target.session);
						draft.subscriptions[args.id] = { ...args, configHash, revision: 1, enabled: true };
					}, ctx);
					return saved.value.subscriptions[args.id]!;
				},
				reviseSubscription: async (args, ctx) => {
					const subscription = saved.value.subscriptions[args.id];
					if (!subscription) throw new Error("No such subscription");
					declaration(subscription.source).validateConfig(args.config);
					if (Buffer.byteLength(canonical(args.config)) > 32768)
						throw new Error("Stimulus configuration exceeds 32768 bytes");
					await validateTarget(args.target, ctx);
					await saved.change((draft) => {
						const current = draft.subscriptions[args.id]!;
						if (current.revision !== args.expectedRevision) throw new Error("Subscription revision conflict");
						openTarget(args.target.session);
						for (const event of Object.values(draft.events))
							if (event.envelope.subscriptionId === args.id) retire(event);
						current.target = args.target;
						current.config = args.config;
						current.configHash = digest(args.config);
						current.revision++;
					}, ctx);
					return saved.value.subscriptions[args.id]!;
				},
				enableSubscription: async (args, ctx) => {
					const subscription = saved.value.subscriptions[args.id];
					if (!subscription) throw new Error("No such subscription");
					if (args.enabled) {
						declaration(subscription.source).validateConfig(subscription.config);
						await validateTarget(subscription.target, ctx);
					}
					await saved.change((draft) => {
						const current = draft.subscriptions[args.id]!;
						if (current.revision !== args.expectedRevision) throw new Error("Subscription revision conflict");
						if (current.enabled === args.enabled) return;
						if (args.enabled) openTarget(current.target.session);
						for (const event of Object.values(draft.events))
							if (event.envelope.subscriptionId === args.id) retire(event);
						current.enabled = args.enabled;
						current.revision++;
					}, ctx);
					return saved.value.subscriptions[args.id]!;
				},
				subscriptions: async ({ session }) =>
					Object.values(saved.value.subscriptions).filter(
						(row) => session === undefined || row.target.session === session,
					),
				publish: async (args, ctx) => {
					const id = eventId(args);
					const encoded = canonical(args.event);
					if (Buffer.byteLength(encoded) > 32768) throw new Error("Stimulus event exceeds 32768 bytes");
					const eventHash = createHash("sha256").update(encoded).digest("hex");
					const previous = saved.value.events[id];
					if (previous) {
						if (previous.envelope.eventHash !== eventHash) throw new Error("Stimulus event conflict");
						return readback(previous);
					}
					const subscription = saved.value.subscriptions[args.subscriptionId];
					if (!subscription) throw new Error("No such subscription");
					await saved.change((draft) => {
						const existing = draft.events[id];
						if (existing) {
							if (existing.envelope.eventHash !== eventHash) throw new Error("Stimulus event conflict");
							return;
						}
						const current = draft.subscriptions[args.subscriptionId]!;
						if (
							!current.enabled ||
							current.revision !== args.revision ||
							sourceKey(current.source) !== sourceKey(args.source)
						)
							throw forbidden("Retired stimulus binding");
						openTarget(current.target.session);
						const source = declaration(current.source);
						const text = source.render(args.event, current.config);
						if (!text.length || Buffer.byteLength(text) > 32768)
							throw new Error("Rendered stimulus must be 1..32768 bytes");
						const intentHash = digest([
							id,
							current.target.session,
							current.target.conversation,
							text,
							source.label,
							current.configHash,
							eventHash,
						]);
						draft.events[id] = {
							envelope: {
								delivery: { id, ...current.target, notBefore: Date.now(), text, intentHash },
								source: { id: current.source.id, version: current.source.version, label: source.label },
								subscriptionId: current.id,
								revision: current.revision,
								eventId: args.eventId,
								eventHash,
								configHash: current.configHash,
							},
							phase: { kind: "scheduled" },
						};
					}, ctx);
					return readback(saved.value.events[id]!);
				},
				receipt: async (args) => {
					const event = saved.value.events[eventId(args)];
					return event ? readback(event) : { state: "missing" as const };
				},
				register: async ({ session, conversation, requestId, at, text }, ctx) => {
					if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(at))
						throw new Error("at needs an ISO timestamp with an explicit UTC offset");
					const notBefore = Date.parse(at);
					if (!Number.isFinite(notBefore) || !formats["date-time"]!(at)) throw new Error("Invalid timestamp");
					const id = JSON.stringify([session, requestId]);
					const intentHash = createHash("sha256")
						.update(JSON.stringify([session, conversation, notBefore, text, "timer"]))
						.digest("hex");
					const previous = saved.value.wakes[id];
					if (previous) {
						if (previous.delivery.intentHash !== intentHash) throw new Error("Wake intent conflict");
						return previous;
					}
					if (notBefore <= Date.now()) throw new Error("New wakes must be in the future");
					if ((await catalog.get({ id: session }, ctx)).archivedAt !== null)
						throw forbidden("Wakes require an unarchived session");
					const row: Wake = {
						delivery: { id, session, conversation, notBefore, text, intentHash },
						phase: { kind: "scheduled" },
					};
					await saved.change((draft) => {
						const existing = draft.wakes[id];
						if (existing && existing.delivery.intentHash !== intentHash) throw new Error("Wake intent conflict");
						if (!existing) draft.wakes[id] = row;
					}, ctx);
					return rowFor(id);
				},
				list: async ({ session }) =>
					Object.values(saved.value.wakes).filter((row) => row.delivery.session === session),
				cancel: async ({ session, id }, ctx) => {
					await saved.change((draft) => {
						const row = draft.wakes[id];
						if (!row || row.delivery.session !== session) throw new Error("No such wake");
						if (row.phase.kind === "scheduled") row.phase = { kind: "closed", reason: "cancelled" };
						else if (row.phase.kind === "pending" || row.phase.kind === "uncertain")
							row.phase = { kind: "uncertain", policy: "readback-only" };
					}, ctx);
					return rowFor(id);
				},
			};
		},
		{ accepts: { 1: {}, 2: {} } },
	);
	host.serve(Subscriptions, (_params, principal, self) => {
		const store = self.get(WakeStore, {});
		if (isOwner(principal))
			return {
				variant: "owner",
				members: {
					createTarget: (args, ctx) => store.createSubscription(args, ctx),
					reviseTarget: (args, ctx) => store.reviseSubscription(args, ctx),
					setEnabled: (args, ctx) => store.enableSubscription(args, ctx),
					list: (_args, ctx) => store.subscriptions({}, ctx),
				},
			};
		if (!isWorker(principal)) throw forbidden("Subscriptions are private");
		const hosts = self.get(Hosts, {});
		const current = async (id: string | undefined, ctx: Ctx) => {
			const worker = hosts.workers.value[principal.session];
			if (!worker?.running || worker.generation !== principal.generation) throw forbidden("Stale worker");
			if (
				id !== undefined &&
				!(await store.subscriptions({ session: principal.session }, ctx)).some((row) => row.id === id)
			)
				throw forbidden("Wrong subscription scope");
		};
		return {
			variant: "worker",
			members: {
				create: async ({ conversation, ...args }, ctx) => {
					await current(undefined, ctx);
					return store.createSubscription({ ...args, target: { session: principal.session, conversation } }, ctx);
				},
				revise: async ({ conversation, ...args }, ctx) => {
					await current(args.id, ctx);
					return store.reviseSubscription({ ...args, target: { session: principal.session, conversation } }, ctx);
				},
				setEnabled: async (args, ctx) => {
					await current(args.id, ctx);
					return store.enableSubscription(args, ctx);
				},
				list: async (_args, ctx) => {
					await current(undefined, ctx);
					return store.subscriptions({ session: principal.session }, ctx);
				},
			},
		};
	});
	host.serve(Wakes, (_params, principal, self) => {
		const store = self.get(WakeStore, {});
		if (isOwner(principal))
			return {
				variant: "owner",
				members: {
					registerTarget: (args, ctx) => store.register(args, ctx),
					listTarget: (args, ctx) => store.list(args, ctx),
					cancelTarget: (args, ctx) => store.cancel(args, ctx),
				},
			};
		if (!isWorker(principal)) throw forbidden("Wakes are private");
		const hosts = self.get(Hosts, {});
		const current = () => {
			const worker = hosts.workers.value[principal.session];
			if (!worker?.running || worker.generation !== principal.generation) throw forbidden("Stale worker");
		};
		return {
			variant: "worker",
			members: {
				register: (args, ctx) => {
					current();
					return store.register({ ...args, session: principal.session }, ctx);
				},
				list: (_args, ctx) => {
					current();
					return store.list({ session: principal.session }, ctx);
				},
				cancel: (args, ctx) => {
					current();
					return store.cancel({ ...args, session: principal.session }, ctx);
				},
			},
		};
	});
});
