// Released v1 state and local callers survive additive source support without changing timer identities.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { arr, int, obj, str } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT, defineFacet, defineState, local, method, record } from "@p2/app/v1";
import { WakeSchema, WakeStore } from "../../plugins/stimuli/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { openHostStore } from "../../src/runtime/host-dirs.ts";
import { testHost } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
const OldStore = local("p2.wake-store", {
	version: 1,
	params: {},
	members: {
		register: method(
			obj({
				session: str(),
				conversation: int(),
				requestId: str(),
				at: str(),
				text: str({ minLength: 1, maxLength: 32768 }),
			}),
			WakeSchema,
		),
		list: method(obj({ session: str() }), arr(WakeSchema)),
		cancel: method(obj({ session: str(), id: str() }), WakeSchema),
	},
});
const OldState = defineState("p2.stimuli", {
	version: 1,
	schema: obj({ wakes: record(WakeSchema) }),
	initial: () => ({ wakes: {} }),
	persist: true,
	checkpointWhen: () => true,
});
it("loads actual persisted v1 wakes and binds released WakeStore callers", async () => {
	const dataDir = await mkdtemp(join(tmpdir(), "p2-stimuli-migration-"));
	const row = {
		delivery: {
			id: '["original-session","request"]',
			session: "original-session",
			conversation: 7,
			notBefore: Date.now() + 60000,
			text: "unchanged",
			intentHash: "original-exact-hash",
		},
		phase: { kind: "scheduled" as const },
	};
	const store = await openHostStore(join(dataDir, "server"), { outbox: false }, TEST);
	const old = await testHost({
		store,
		facets: [
			defineFacet((host) =>
				host.serve(OldStore, (_params, self) => {
					const saved = self.state(OldState);
					return {
						register: async (_args, ctx) => {
							await saved.change((draft) => {
								draft.wakes[row.delivery.id] = row;
							}, ctx);
							return row;
						},
						list: async () => Object.values(saved.value.wakes),
						cancel: async () => row,
					};
				}),
			),
		],
	});
	try {
		await old.root(async (ctx) =>
			(await ctx.get(OldStore, {})).register(
				{
					session: row.delivery.session,
					conversation: 7,
					requestId: "request",
					at: new Date(row.delivery.notBefore).toISOString(),
					text: row.delivery.text,
				},
				ctx,
			),
		);
	} finally {
		await old.close();
		await store.close(TEST);
	}
	const server = await startServer({ dataDir, port: 0, fake: true, web: false });
	try {
		await server.host.root(async (ctx) => {
			assert.deepEqual(await (await ctx.get(WakeStore, {})).list({ session: row.delivery.session }, ctx), [row]);
			assert.deepEqual(await (await ctx.get(OldStore, {})).list({ session: row.delivery.session }, ctx), [row]);
			assert.deepEqual(await (await ctx.get(WakeStore, {})).subscriptions({}, ctx), []);
		}, TEST);
	} finally {
		await server.close();
		await rm(dataDir, { recursive: true, force: true });
	}
});
