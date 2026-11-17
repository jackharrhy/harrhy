// Optional fail-open Rex mirror: fixed project targets, catalog/event wakeups and a slow fallback.
import { setTimeout } from "node:timers/promises";
import { defineFacet, local } from "@p2/app/v1";
import { Server } from "@p2/app/v1/server";
import { ProjectService } from "../projects/contract.ts";
import { Catalog } from "../sessions/contract.ts";
import { RexCli } from "./cli.ts";
import { RexStore, readConfig } from "./config.ts";
import { reconcile } from "./reconcile.ts";
import { routes } from "./routing.ts";

const Mirror = local("p2.rex-mirror", { version: 1, params: {}, members: {} });

export default defineFacet((host) => {
	host.serve(Mirror, (_params, self) => {
		const server = self.get(Server, {});
		const catalog = self.get(Catalog, {});
		const projects = self.get(ProjectService, {});
		let dirty = false;
		let wake = () => {};
		const changed = () => {
			dirty = true;
			wake();
		};
		self.on(catalog.sessions, async () => changed());
		self.on(projects.sessions, async () => changed());
		const failure = self.writable("");
		// Report target failures through Chord without stopping healthy targets or their event subscriptions.
		self.on(failure, async ({ value }) => {
			if (value) throw new Error(value);
		});
		self.onLive(async (ctx) => {
			const info = server.info.value;
			const store = new RexStore(info.dataDir);
			let client: RexCli | undefined;
			let clientKey = "";
			const streams = new Map<string, () => void>();
			const stopEvents = () => {
				for (const stop of streams.values()) stop();
				streams.clear();
			};
			try {
				while (!ctx.abortSignal?.aborted) {
					dirty = false;
					let created = false;
					const config = await readConfig(info.dataDir);
					if (config) {
						const key = JSON.stringify(config);
						if (!client || clientKey !== key) {
							stopEvents();
							client = new RexCli(config);
							clientKey = key;
						}
						const state = await store.load();
						const plan = routes(config, state, catalog.sessions.value, projects.sessions.value);
						for (const [id, stop] of streams) {
							if (plan.targets.some((route) => route.config.sessionId === id)) continue;
							stop();
							streams.delete(id);
						}
						if (plan.changed) await store.save(state);
						const errors = plan.notices;
						const budget = { remaining: 1 };
						for (const route of plan.targets) {
							try {
								created =
									(await reconcile(
										client,
										route.config,
										state,
										route.sessions,
										{ app: info.app, dataDir: info.dataDir, url: `http://127.0.0.1:${info.port}` },
										() => store.save(state),
										() => ctx.abortSignal?.throwIfAborted(),
										budget,
									)) || created;
								ctx.abortSignal?.throwIfAborted();
								if (!streams.has(route.config.sessionId)) {
									const id = route.config.sessionId;
									streams.set(
										id,
										client.events(id, changed, () => {
											streams.delete(id);
											changed();
										}),
									);
								}
							} catch (error) {
								ctx.abortSignal?.throwIfAborted();
								errors.push(
									`Rex target ${route.config.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
								);
							}
						}
						const message = errors.join("\n");
						if (failure.value !== message) failure.set(message);
					} else {
						stopEvents();
						client = undefined;
						clientKey = "";
						if (failure.value) failure.set("");
					}
					ctx.abortSignal?.throwIfAborted();
					// One creation/pass across every target, and at most one pass a second.
					await setTimeout(1000, undefined, { signal: ctx.abortSignal });
					if (created || dirty) continue;
					const pause = new AbortController();
					const abort = () => pause.abort();
					ctx.abortSignal?.addEventListener("abort", abort, { once: true });
					wake = abort;
					try {
						await setTimeout(29_000, undefined, { signal: pause.signal });
					} catch (error) {
						if (!pause.signal.aborted) throw error;
					} finally {
						wake = () => {};
						ctx.abortSignal?.removeEventListener("abort", abort);
					}
				}
			} finally {
				stopEvents();
			}
		});
		return {};
	});
});
