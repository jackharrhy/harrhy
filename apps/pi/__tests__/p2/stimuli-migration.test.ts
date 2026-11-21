import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { arr, int, obj, str } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT, defineFacet, defineState, local, method, record } from "@p2/app/v1";
import {
	AdmissionV2,
	SourceEventSchema,
	SubscriptionSchema,
	WakeSchema,
	WakeStoreV2,
} from "../../plugins/stimuli/contract.ts";
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
const OldStateV2 = defineState("p2.stimuli", {
	version: 2,
	schema: obj({
		wakes: record(WakeSchema),
		subscriptions: record(SubscriptionSchema),
		events: record(SourceEventSchema),
	}),
	initial: () => ({ wakes: {}, subscriptions: {}, events: {} }),
	persist: true,
	checkpointWhen: () => true,
});

for (const version of [1, 2]) it(`opens v${version} stimuli with the released callers`, () => checkMigration(version));

async function checkMigration(version: number) {
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
	const source = { id: "original", version: 1 };
	const subscription = {
		id: "sub",
		enabled: false,
		source,
		revision: 1,
		target: { session: row.delivery.session, conversation: 7 },
		config: {},
		configHash: "original-config",
	};
	const binding = { source, subscriptionId: "sub", revision: 1, eventId: "event" };
	const id = 'source:["original",1,"sub",1,"event"]';
	const event = {
		envelope: {
			...binding,
			delivery: { ...row.delivery, id },
			source: { ...source, label: "Original" },
			eventHash: "original-event",
			configHash: subscription.configHash,
		},
		phase: {
			kind: "settled" as const,
			outcome: "done" as const,
			receipt: {
				state: "admitted" as const,
				deliveryId: id,
				intentHash: row.delivery.intentHash,
				conversation: 7,
				submissionId: 42,
			},
		},
	};
	const store = await openHostStore(join(dataDir, "server"), { outbox: false }, TEST);
	const old = await testHost({
		store,
		facets: [
			defineFacet((host) =>
				host.serve(OldStore, (_params, self) => {
					const saved = version === 1 ? self.state(OldState) : self.state(OldStateV2);
					return {
						register: async (_args, ctx) => {
							await saved.change((draft) => {
								draft.wakes[row.delivery.id] = row;
								if (version === 2)
									Object.assign(draft, { subscriptions: { [subscription.id]: subscription }, events: { [id]: event } });
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
			// Fingerprints from main (03cbaf70), independent of the current declarations.
			assert.equal(WakeStoreV2.fingerprint, "70ae8f331bcdf592");
			assert.equal(AdmissionV2.fingerprint, "d2bc6a5d23c5725c");
			const store = await ctx.get(WakeStoreV2, {});
			assert.deepEqual(await (await ctx.get(OldStore, {})).list({ session: row.delivery.session }, ctx), [row]);
			assert.deepEqual(await store.subscriptions({}, ctx), version === 2 ? [subscription] : []);
			if (version === 2) assert.deepEqual(await store.receipt(binding, ctx), { state: "admitted", event });
		}, TEST);
	} finally {
		await server.close();
		await rm(dataDir, { recursive: true, force: true });
	}
}
