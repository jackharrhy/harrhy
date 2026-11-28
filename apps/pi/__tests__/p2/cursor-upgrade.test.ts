// Boot the current plugin on independently written state from the first, released and transitional schemas.
import assert from "node:assert/strict";
import { join } from "node:path";
import { it } from "node:test";
import { arr, obj, type Schema, type Static } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT as TEST, defineFacet, defineState, local, method } from "@p2/app/v1";
import { CursorRuns, CursorSettings } from "../../integrations/cursor/contract.ts";
import { CursorStore } from "../../integrations/cursor/store.ts";
import { createHost, Server } from "../../src/runtime/chord.ts";
import { openHostStore } from "../../src/runtime/host-dirs.ts";
import { type RunRecordV1, StoreV1, writerV1 } from "../fixtures/cursor-v1-store.ts";
import { ConfigSchema, RunRecordSchema } from "../fixtures/cursor-v4-schema.ts";
import { holdIn, startFixture } from "./helpers.ts";

const SESSION = "legacy-session";
const cloudRun: RunRecordV1 = {
	id: `cursor-${"a".repeat(24)}`,
	runtime: "cloud",
	mode: "ask",
	status: "finished",
	model: "composer-2",
	repo: "acme/site", branch: "main",
	prompt: "what does this repo do?",
	createdAt: 1_700_000_000_000,
	finishedAt: 1_700_000_005_000,
	durationMs: 5000,
	usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, chargedCents: 3 },
	git: { branch: "cursor/x", prUrl: "https://example.test/pr/1" },
	resultChars: 11,
	session: SESSION,
	conversation: 1,
	agentId: "agent-1",
	cursorRunId: "run-1",
	deadline: 1_700_001_800_000,
	text: "It is a game.",
	notified: "yes",
};
const { runtime, ...cloudFields } = cloudRun;
const expected = { ...cloudFields, mode: "plan" };
const config = { keyStored: false, model: "composer-2", repos: ["acme/*", "Other/Site"], allowCloudEdits: true };

async function writePrior(dataDir: string, version: 1 | 3 | 4) {
	const disk = await openHostStore(join(dataDir, "server"), { outbox: false }, TEST);
	const old = createHost({ store: disk, address: Server(), onError: () => {} });
	try {
		const localRun = { ...cloudRun, id: `cursor-${"b".repeat(24)}`, runtime: "local" as const, cwd: "/tmp/work" };
		if (version === 1) {
			assert.deepEqual((await old.load([{ name: "cursor-v1", facet: writerV1 }], TEST)).failed, []);
			await old.root(async (ctx) => (await ctx.get(StoreV1, {})).seed({ runs: [localRun, cloudRun] }, ctx), TEST);
			return;
		}
		const { backend, ...v3 } = RunRecordSchema.properties as Record<string, unknown>;
		const record: Schema<Static<typeof RunRecordSchema>> = version === 4 ? RunRecordSchema : { ...RunRecordSchema, properties: v3 };
		const Config = defineState("p2.cursor-config", { version: 4, schema: ConfigSchema, persist: true, checkpointWhen: () => true,
			initial: () => ({ ...config, runtime: "local" as const, allowLocalEdits: true }) });
		const Runs = defineState("p2.cursor-runs", { version, schema: obj({ runs: arr(record, { maxItems: 66 }) }), persist: true,
			checkpointWhen: () => true, initial: () => ({ runs: [] as Static<typeof RunRecordSchema>[] }) });
		const store = local("p2.cursor-store", { version: version + 1, params: {}, members: { seed: method(obj({})) } });
		const facet = defineFacet((host) => host.serve(store, (_params, self) => {
			const configs = self.state(Config), runs = self.state(Runs);
			return { seed: async (_, ctx) => {
				await configs.change((draft) => { Object.assign(draft, { sandbox: "required", autoResume: true, maxRuns: 9, maxPerSession: 5 }); }, ctx);
				await runs.change((draft) => { draft.runs = [{ ...localRun, ...(version === 4 ? { backend: "acp" as const } : {}) }, cloudRun]; }, ctx);
				return null;
			} };
		}));
		assert.deepEqual((await old.load([{ name: "cursor-prior", facet }], TEST)).failed, []);
		await old.root(async (ctx) => (await ctx.get(store, {})).seed({}, ctx), TEST);
	} finally {
		await old.close(TEST);
		await disk.close(TEST);
	}
}


for (const version of [1, 3, 4] as const) {
	it(`upgrades installed v${version} runs: retains cloud results as plan, drops local history`, { timeout: 60_000 }, async (t) => {
		const fixture = await startFixture({ integrations: ["cursor"], prepare: (dir) => writePrior(dir, version) });
		t.after(() => fixture.close());
		await fixture.server.host.root(async (ctx) => {
			const store = await ctx.get(CursorStore, {});
			assert.deepEqual(store.config.value, { ...config, allowCloudEdits: version !== 1, maxRuns: version === 1 ? 6 : 9, maxPerSession: version === 1 ? 4 : 5 });
			assert.deepEqual(store.runs.value, [expected]);
		}, TEST);
		const settings = await holdIn(fixture.browser(), CursorSettings, {}, "owner");
		assert.equal(settings.model.value, cloudRun.model);
		const runs = await holdIn(fixture.as({ kind: "worker", session: SESSION, generation: 1 }), CursorRuns, {}, "worker");
		const result = await runs.result({ id: cloudRun.id }, TEST);
		assert.equal(result.text, cloudRun.text);
		assert.deepEqual(result.run.usage, cloudRun.usage);
		runs.release();
		settings.release();
	});
}
