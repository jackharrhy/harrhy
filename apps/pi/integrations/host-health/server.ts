import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { compile, int, obj, str } from "@earendil-works/pi-schema";
import { contribute, defineFacet, defineState, record, signalOf, sleep } from "@p2/app/v1";
import { bindStimulusPublisher, defineStimulusSource, sourceKey, StimulusSources, WakeStore } from "@p2/app/v1/server";
import { Cursor, initial, Metric, observe, policies } from "./policy.ts";
import { hostProbes } from "./probes.ts";

const Check = obj({ check: Metric });
const check = compile(Check);

export const HostHealth = defineStimulusSource({
	id: "p2.host-health",
	version: 1,
	label: "Host health",
	configSchema: Check,
	eventSchema: obj({ host: str(), at: int(), value: int(), threshold: int() }),
	render: (event, config) => {
		const policy = policies[config.check];
		return `${policy.label} on ${event.host}: ${policy.format(event.value)}, ${policy.direction} ${policy.format(event.threshold)} at ${new Date(event.at).toISOString()}.

Recheck the reading on the monitored host and follow the conversation’s approved incident runbook. This alert does not authorize deletion or service restarts.`;
	},
});

const Saved = defineState("p2.host-health", {
	version: 1,
	schema: obj({ watches: record(obj({ epoch: str(), host: str(), cursor: Cursor })) }),
	initial: () => ({ watches: {} }),
	persist: true,
	checkpointWhen: (_value, _ops, info) => info.deltasSinceBase >= 30,
});

export function hostHealthFacet(host: string, probes: ReturnType<typeof hostProbes>, interval: number) {
	return defineFacet((facetHost) => {
		contribute(facetHost, "p2.host-health.poller", (self) => {
			self.contribute(StimulusSources, { [sourceKey(HostHealth)]: HostHealth });
			const saved = self.state(Saved);
			self.onLive(async (ctx) => {
				const signal = signalOf(ctx);
				const errors = new Map<string, string>();
				while (!signal.aborted) {
					const problems = new Map<string, string>();
					const report = (key: string, error: unknown) => {
						const message = String(error);
						problems.set(key, message);
						if (!signal.aborted && errors.get(key) !== message)
							console.error(`p2 host-health (${key}): ${message}`);
					};
					try {
						const store = await ctx.get(WakeStore, {});
						const rows = (await store.subscriptions({}, ctx)).filter(
							(row) => row.enabled && sourceKey(row.source) === sourceKey(HostHealth),
						);
						const keyOf = (row: (typeof rows)[number]) => JSON.stringify([row.id, row.revision]);
						const live = new Set(rows.map(keyOf));
						const retired = Object.keys(saved.value.watches).filter((key) => !live.has(key));
						if (retired.length) await saved.change((draft) => {
							for (const key of retired) delete draft.watches[key];
						}, ctx);
						const readings = new Map<Metric, Promise<number | undefined>>();
						for (const row of rows) {
							if (signal.aborted) return;
							if (!check.check(row.config)) continue;
							const metric = row.config.check;
							const key = keyOf(row);
							try {
								let watch = saved.value.watches[key];
								if (!watch?.cursor.pending) {
									let reading = readings.get(metric);
									if (!reading) {
										reading = probes[metric]().catch((error: unknown) => {
											report(metric, error);
											return undefined;
										});
										readings.set(metric, reading);
									}
									const cursor = watch?.cursor ?? initial();
									const next = observe(policies[metric], cursor, await reading, Date.now());
									if (next === cursor) continue;
									const updated = { epoch: watch?.epoch ?? randomUUID(), host, cursor: next };
									await saved.change((draft) => { draft.watches[key] = updated; }, ctx);
									watch = updated;
								}
								const pending = watch.cursor.pending;
								if (!pending) continue;
								await bindStimulusPublisher(store, HostHealth, row).publish({
									eventId: `${watch.epoch}:${watch.cursor.sequence}`, event: { ...pending, host: watch.host },
								}, ctx);
								await saved.change((draft) => { delete draft.watches[key]!.cursor.pending; }, ctx);
							} catch (error) {
								report(key, error);
							}
						}
					} catch (error) {
						report("poller", error);
					}
					errors.clear();
					for (const [key, message] of problems) errors.set(key, message);
					if (!signal.aborted) await sleep(interval, ctx).catch(() => {});
				}
			});
		});
	});
}

export default hostHealthFacet(hostname(), hostProbes(), 60_000);
