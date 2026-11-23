import { statfs } from "node:fs/promises";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { int, obj, str } from "@earendil-works/pi-schema";
import { contribute, defineFacet, defineState, record, signalOf, sleep } from "@p2/app/v1";
import { bindStimulusPublisher, defineStimulusSource, sourceKey, StimulusSources, WakeStore } from "@p2/app/v1/server";
import { Check, Cursor, GiB, initial, observe } from "./disk.ts";

export const HostHealth = defineStimulusSource({
	id: "p2.host-health",
	version: 1,
	label: "Host health",
	configSchema: Check,
	eventSchema: obj({ host: str(), at: int(), available: int(), threshold: int() }),
	render: (event) =>
		`Low disk space on ${event.host} (/): ${(event.available / GiB).toFixed(2)} GiB available, below ${event.threshold / GiB} GiB at ${new Date(event.at).toISOString()}.\n\nRecheck free space on the monitored host. Follow the conversation’s approved incident runbook; this alert does not authorize deletion or service restarts.`,
});

const Saved = defineState("p2.host-health", {
	version: 1,
	schema: obj({ watches: record(obj({ epoch: str(), host: str(), cursor: Cursor })) }),
	initial: () => ({ watches: {} }),
	persist: true,
	checkpointWhen: (_value, _ops, info) => info.deltasSinceBase >= 30,
});

export function hostHealthFacet(probe: () => Promise<{ host: string; available: number }>, interval: number) {
	return defineFacet((host) => {
		contribute(host, "p2.host-health.poller", (self) => {
			self.contribute(StimulusSources, { [sourceKey(HostHealth)]: HostHealth });
			const saved = self.state(Saved);
			self.onLive(async (ctx) => {
				const signal = signalOf(ctx);
				let lastError: string | undefined;
				while (!signal.aborted) {
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
						if (rows.length) {
							const sample = await probe();
							for (const row of rows) {
								const key = keyOf(row);
								const old = saved.value.watches[key];
								const watch = old ?? { epoch: randomUUID(), host: sample.host, cursor: initial() };
								const next = observe(watch.cursor, sample.available, Date.now());
								if (next !== watch.cursor) await saved.change((draft) => {
									draft.watches[key] = { ...watch, host: sample.host, cursor: next };
								}, ctx);
								const pending = next.pending;
								if (!pending) continue;
								const { id, ...event } = pending;
								await bindStimulusPublisher(store, HostHealth, row).publish({
									eventId: `${watch.epoch}:${id}`, event: { ...event, host: old?.cursor.pending ? watch.host : sample.host },
								}, ctx);
								await saved.change((draft) => { delete draft.watches[key]!.cursor.pending; }, ctx);
							}
						}
						lastError = undefined;
					} catch (error) {
						if (signal.aborted) return;
						const message = String(error);
						if (lastError !== message) console.error(`p2 host-health: ${message}`);
						lastError = message;
					}
					if (!signal.aborted) await sleep(interval, ctx).catch(() => {});
				}
			});
		});
	});
}

export default hostHealthFacet(async () => {
	const fs = await statfs("/", { bigint: true });
	return { host: hostname(), available: Number(fs.bavail * fs.bsize) };
}, 60_000);
