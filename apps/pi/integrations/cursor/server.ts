// Cursor as a tool (README.md): the owner's settings, the agent's side of the runs and the watcher that publishes a stimulus
// to the session when a run ends. The API key lives in cursor-secrets.json and never leaves this file's side of the wire.
import { type Ctx, contribute, defineFacet, deriveTyped, forbidden, invalid, isOwner, isWorker } from "@p2/app/v1";
import { Server, StimulusSources, sourceKey } from "@p2/app/v1/server";
import { CursorRun } from "./contract.server.ts";
import { CursorRuns, CursorSettings } from "./contract.ts";
import { type Deps, createManager, type Manager } from "./runs.ts";
import { openSecrets, type CursorSecrets } from "./secrets.ts";
import { sdkClient } from "./sdk.ts";
import { ConfigState, CursorStore, MAX_REPOS, RunsState } from "./store.ts";

const ALLOW = /^(?!\.{1,2}\/)[A-Za-z0-9._-]+\/(?:\*|(?!\.{1,2}$)[A-Za-z0-9._-]+)$/;
const KEY = /^\S{8,512}$/;
const MODEL = /^[\w.:/@+-]{0,200}$/;

export default defineFacet((host) => {
	let shared: Promise<{ manager: Manager; secrets: CursorSecrets }> | undefined;
	/** The manager and the key file, made on first use: this plugin version's own, living until it is replaced. */
	const open = (ctx: Ctx) => {
		shared ??= (async () => {
			const server = await ctx.get(Server, {});
			const secrets = openSecrets(server.info.value.dataDir);
			const deps: Deps = {
				secrets,
				factory: sdkClient,
				env: process.env,
				minuteMs: Number(process.env.P2_CURSOR_MINUTE_MS) || 60_000,
				graceMs: Number(process.env.P2_CURSOR_GRACE_MS) || 15_000,
				log: (message) => console.error(`p2 cursor: ${message}`),
			};
			return { manager: createManager(deps), secrets };
		})();
		return shared;
	};

	host.serve(CursorStore, (_params, self) => {
		const config = self.state(ConfigState);
		const runs = self.state(RunsState);
		return {
			config: deriveTyped(self, [config], ([value]) => value),
			runs: deriveTyped(self, [runs], ([value]) => value.runs),
			patchConfig: async (patch, ctx) => {
				await config.change((draft) => {
					if (patch.keyStored !== undefined) draft.keyStored = patch.keyStored;
					if (patch.model !== undefined) draft.model = patch.model;
					if (patch.runtime !== undefined) draft.runtime = patch.runtime;
					if (patch.allowLocalEdits !== undefined) draft.allowLocalEdits = patch.allowLocalEdits;
					if (patch.allowCloudEdits !== undefined) draft.allowCloudEdits = patch.allowCloudEdits;
					const allow = patch.allowRepo;
					if (allow !== undefined && !draft.repos.some((have) => have.toLowerCase() === allow.toLowerCase())) {
						if (draft.repos.length >= MAX_REPOS) throw invalid("args", `At most ${MAX_REPOS} repositories`);
						draft.repos.push(allow);
					}
					const remove = patch.removeRepo;
					if (remove !== undefined) draft.repos = draft.repos.filter((have) => have.toLowerCase() !== remove.toLowerCase());
				}, ctx);
				return null;
			},
			put: async (record, ctx) => {
				await runs.change((draft) => {
					const at = draft.runs.findIndex((have) => have.id === record.id);
					if (at >= 0) draft.runs[at] = record;
					else draft.runs.push(record);
					// Finished runs are kept up to a limit, oldest first out; running ones always stay.
					const finished = draft.runs.filter((have) => have.status !== "running").sort((a, b) => b.createdAt - a.createdAt);
					const drop = new Set(finished.slice(50).map((have) => have.id));
					if (drop.size > 0) draft.runs = draft.runs.filter((have) => !drop.has(have.id));
				}, ctx);
				return null;
			},
			remove: async ({ id }, ctx) => {
				await runs.change((draft) => {
					draft.runs = draft.runs.filter((have) => have.id !== id);
				}, ctx);
				return null;
			},
		};
	});

	host.serve(CursorSettings, (_params, principal, self) => {
		if (!isOwner(principal)) throw forbidden("Cursor settings are the owner's");
		const store = self.get(CursorStore, {});
		const patch = (change: Parameters<typeof store.patchConfig>[0], ctx: Ctx) => store.patchConfig(change, ctx);
		return {
			variant: "owner",
			members: {
				keyStored: deriveTyped(self, [store.config], ([value]) => value.keyStored),
				keyFromEnv: deriveTyped(self, [store.config], () => Boolean(process.env.CURSOR_API_KEY?.trim())),
				model: deriveTyped(self, [store.config], ([value]) => value.model),
				runtime: deriveTyped(self, [store.config], ([value]) => value.runtime),
				repos: deriveTyped(self, [store.config], ([value]) => value.repos),
				allowLocalEdits: deriveTyped(self, [store.config], ([value]) => value.allowLocalEdits),
				allowCloudEdits: deriveTyped(self, [store.config], ([value]) => value.allowCloudEdits),
				setKey: async ({ key }, ctx) => {
					const trimmed = key.trim();
					// The message never repeats the key.
					if (!KEY.test(trimmed)) throw invalid("args", "That does not look like an API key (no spaces, 8 to 512 characters)");
					const { secrets } = await open(ctx);
					await secrets.write(trimmed);
					await patch({ keyStored: true }, ctx);
					return null;
				},
				clearKey: async (_args, ctx) => {
					const { secrets } = await open(ctx);
					await secrets.clear();
					await patch({ keyStored: false }, ctx);
					return null;
				},
				testKey: async (_args, ctx) => {
					const { manager } = await open(ctx);
					const key = await manager.apiKey();
					if (key === undefined) return { ok: false, message: "No API key: enter one here, or set CURSOR_API_KEY on the Pi server" };
					try {
						const name = await (await manager.clientFor(key)).whoAmI();
						return { ok: true, message: `The key works (named “${manager.safe(name, key, 100)}”)` };
					} catch (error) {
						return { ok: false, message: manager.safe(error, key) };
					}
				},
				listModels: async (_args, ctx) => {
					const { manager } = await open(ctx);
					const key = await manager.apiKey();
					if (key === undefined) return { ok: false, message: "No API key", models: [] };
					try {
						const models = (await (await manager.clientFor(key)).models()).slice(0, 300);
						return { ok: true, message: `${models.length} models`, models };
					} catch (error) {
						return { ok: false, message: manager.safe(error, key), models: [] };
					}
				},
				setDefaults: async ({ model, runtime }, ctx) => {
					if (!MODEL.test(model)) throw invalid("args", "That is not a model id");
					await patch({ model, runtime }, ctx);
					return null;
				},
				allow: async ({ repo }, ctx) => {
					const name = repo.trim();
					if (!ALLOW.test(name)) throw invalid("args", "Use owner/name, or owner/* for every repository of an owner");
					await patch({ allowRepo: name }, ctx);
					return null;
				},
				remove: async ({ repo }, ctx) => {
					await patch({ removeRepo: repo }, ctx);
					return null;
				},
				setAllowLocalEdits: async ({ allow }, ctx) => {
					await patch({ allowLocalEdits: allow }, ctx);
					return null;
				},
				setAllowCloudEdits: async ({ allow }, ctx) => {
					await patch({ allowCloudEdits: allow }, ctx);
					return null;
				},
			},
		};
	});

	host.serve(CursorRuns, (_params, principal) => {
		if (!isWorker(principal)) throw forbidden("Cursor runs are for session workers");
		const session = principal.session;
		return {
			variant: "worker",
			members: {
				start: async (args, ctx) => (await open(ctx)).manager.start(session, args),
				status: async ({ id }, ctx) => (await open(ctx)).manager.status(session, id),
				result: async ({ id, maxChars }, ctx) => (await open(ctx)).manager.result(session, id, maxChars),
				cancel: async ({ id }, ctx) => (await open(ctx)).manager.cancel(session, id),
				list: async (_args, ctx) => (await open(ctx)).manager.list(session),
			},
		};
	});

	contribute(host, "p2.cursor-runner", (self) => {
		self.contribute(StimulusSources, { [sourceKey(CursorRun)]: CursorRun });
		self.onLive(async (ctx) => {
			const { manager, secrets } = await open(ctx);
			const store = await ctx.get(CursorStore, {});
			try {
				// The key file is the truth about whether a key is stored.
				const stored = (await secrets.read()) !== undefined;
				if (store.config.value.keyStored !== stored) await store.patchConfig({ keyStored: stored }, ctx);
				await manager.run(ctx, store);
			} finally {
				await secrets.close();
			}
		});
	});
});
