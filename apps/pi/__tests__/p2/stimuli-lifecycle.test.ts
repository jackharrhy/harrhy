// Controlled lost replies and a blocked route around production admission, backed by real Durable SQLite.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { obj, str } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT, createHost, defineFacet, Session, signalOf } from "@p2/app/v1";
import { Hosts, WorkerInitValues } from "@p2/app/v1/server";
import inboxFacet from "../../integrations/local-inbox/server.ts";
import { LocalInboxAdmin } from "../../integrations/local-inbox/contract.ts";
import { createP2Models } from "../../plugins/models/models.ts";
import { Catalog, type Session as SessionRow } from "../../plugins/sessions/contract.ts";
import {
	bindStimulusPublisher,
	defineStimulusSource,
	StimulusSources,
	sourceKey,
} from "../../plugins/stimuli/contract.server.ts";
import { AddressedWorker, Admission, AdmissionV2, StimulusWorker, WakeStore } from "../../plugins/stimuli/contract.ts";
import serverFacet from "../../plugins/stimuli/server.ts";
import workerFacetPlugin from "../../plugins/stimuli/worker.ts";
import { durableContext } from "../../src/runtime/durable.ts";
import { PEER_MESSAGE_ENTRY } from "../../src/runtime/entries.ts";
import { openHostStore } from "../../src/runtime/host-dirs.ts";
import { SERVER } from "../../src/runtime/principals.ts";
import type { HarnessParts } from "../../src/runtime/worker.ts";
import { APP, binaryCodec, holdIn, memoryLinkPair, poll, testHost, workerFacet } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
it("recovers interrupted native admissions across restart and grant changes", { timeout: 45_000 }, async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "p2-stimuli-fault-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const durableCtx = durableContext(new AbortController().signal);
	const openDurable = async () =>
		Harness.open(
			await openNodeSqliteStorage(join(directory, "session.sqlite")),
			{
				models: createP2Models(true),
				registry: createRegistry(),
			},
			durableCtx,
		);
	let durable = await openDurable();
	t.after(() => durable.close(durableCtx));
	await durable.root(durableCtx, { agent: { model: { provider: "faux", modelId: "faux-1" }, cwd: directory } });
	const fenceClient = createHost({
		onError: (error) => {
			throw error;
		},
	});
	t.after(() => fenceClient.close(TEST));
	const openActual = () =>
		testHost({
			kind: "worker",
			address: Session({ id: "lost" }),
			facets: [
				workerFacet({
					host: () => fenceClient,
					harness: { durable, environments: {}, relocate: async () => {} } as unknown as HarnessParts,
					worker: {
						init: {
							app: APP,
							dataDir: directory,
							fake: true,
							telemetry: false,
							generation: 1,
							values: {
								session: {
									id: "lost",
									cwd: directory,
									model: { provider: "faux", modelId: "faux-1" },
									thinkingLevel: "off",
								},
							},
						},
					},
				}),
				workerFacetPlugin,
			],
		});
	let actual = await openActual();
	t.after(() => actual.close());
	const sourceCommitted = Promise.withResolvers<void>();
	let admitCalls = 0;
	let interruptNextCatalogRead = false;
	let interruptAdmission = true;
	let observeReadback = () => {};
	let hide = true;
	let releaseReadback = () => {};
	const readbackEntered = Promise.withResolvers<void>();
	const proxy = await testHost({
		kind: "worker",
		address: Session({ id: "lost" }),
		facets: [
			defineFacet((host) => {
				host.serve(AddressedWorker, () => ({
					variant: "server",
					members: {
						main: async () => {
							interruptNextCatalogRead = true;
							return 1;
						},
						admit: (args) => {
							if (interruptAdmission) throw new Error("Worker temporarily unavailable");
							return actual.root(async (ctx) => (await ctx.get(Admission, {})).admitAddressed(args, ctx));
						},
					},
				}));
				host.serve(StimulusWorker, (_params, _principal, _self) => ({
					variant: "server",
					members: {
						admitSource: async (envelope) => {
							admitCalls++;
							await actual.root(async (ctx) => (await ctx.get(Admission, {})).admitSource(envelope, ctx));
							sourceCommitted.resolve();
							throw new Error("Source reply lost after native commit");
						},
						validateTarget: (args) =>
							actual.root(async (ctx) => (await ctx.get(Admission, {})).validateTarget(args, ctx)),
						admit: async (delivery) => {
							admitCalls++;
							await actual.root(async (ctx) => (await ctx.get(Admission, {})).admit(delivery, ctx));
							throw new Error("Reply lost after native commit");
						},
						status: async (key, ctx) => {
							if (key.id.startsWith("addressed:")) observeReadback();
							if (hide && admitCalls >= (key.id.startsWith("source:") ? 2 : 1)) {
								readbackEntered.resolve();
								await new Promise<void>((resolve) => {
									releaseReadback = resolve;
								});
								if (signalOf(ctx).aborted) throw signalOf(ctx).reason;
								return { state: "missing" as const };
							}
							const status = await actual.root(async (local) => (await local.get(AdmissionV2, {})).status(key, local));
							if (key.id.startsWith("addressed:") && "receipt" in status)
								throw new Error("Settlement status unavailable");
							return status;
						},
					},
				}));
			}),
		],
	});
	t.after(() => {
		releaseReadback();
		return proxy.close();
	});
	const gate = Promise.withResolvers<void>();
	let blockedStarted = false;
	const rows: SessionRow[] = ["lost", "blocked"].map((id) => ({
		id,
		cwd: directory,
		title: id,
		createdAt: 1,
		updatedAt: 1,
		archivedAt: null,
		pinned: false,
		model: { provider: "faux", modelId: "faux-1" },
		thinkingLevel: "off",
		main: 1,
		branches: [],
	}));
	let link: ReturnType<typeof memoryLinkPair>[0] | undefined;
	let store = await openHostStore(join(directory, "server"), { outbox: false }, TEST);
	t.after(() => store.close(TEST));
	const source = defineStimulusSource({
		id: "test.fault",
		version: 1,
		label: "Fault source",
		configSchema: obj({}),
		eventSchema: obj({ text: str() }),
		render: (event) => event.text,
	});
	const openServer = (withInbox = true) =>
		testHost({
			store,
			facets: [
				defineFacet((_host, self) => {
					self.contribute(WorkerInitValues, { session: async () => ({}) });
					self.contribute(StimulusSources, { [sourceKey(source)]: source });
				}),
				serverFacet,
				...(withInbox ? [inboxFacet] : []),
			],
			stubs: [
				[
					Hosts,
					(_params, _principal, self) => ({
						workers: self.state({ lost: { running: true, generation: 1, pid: process.pid } }),
						stop: async () => null,
					}),
				],
				[
					Catalog,
					(_params, _principal, self) => ({
						sessions: self.state(rows),
						openIds: async () => rows.map((row) => row.id),
						get: async ({ id }: { id: string }) => {
							if (interruptNextCatalogRead) {
								interruptNextCatalogRead = false;
								throw new Error("Catalog temporarily unavailable");
							}
							return rows.find((row) => row.id === id)!;
						},
						create: async () => {
							throw new Error("unused");
						},
						activity: async () => null,
						assignSlug: async () => {
							throw new Error("unused");
						},
						update: async () => {
							throw new Error("unused");
						},
					}),
				],
			],
			beforeLoad: (host) =>
				host.route(
					Session,
					{
						authorize: () => true,
						resolve: async (address) => {
							if (address.params.id === "blocked") {
								blockedStarted = true;
								await gate.promise;
								throw new Error("blocked route ended");
							}
							if (!link) {
								const [down, up] = memoryLinkPair();
								proxy.host.connect(up, { principal: SERVER }, TEST);
								link = down;
							}
							return { link, principal: { kind: "worker", session: "lost", generation: 1 } };
						},
					},
					TEST,
				),
		});
	let server = await openServer();
	t.after(() => {
		gate.resolve();
		return server.close();
	});
	const restart = async (withInbox = true) => {
		gate.resolve();
		await server.close();
		await store.close(TEST);
		link = undefined;
		store = await openHostStore(join(directory, "server"), { outbox: false }, TEST);
		server = await openServer(withInbox);
	};
	const register = (session: string, requestId: string) =>
		server.root(async (ctx) =>
			(await ctx.get(WakeStore, {})).register(
				{
					session,
					conversation: 1,
					requestId,
					at: new Date(Date.now() + 100).toISOString(),
					text: "fault wake",
				},
				ctx,
			),
		);
	const blocked = await register("blocked", "blocked");
	const lost = await register("lost", "lost");
	await poll(() => admitCalls > 0, 5000, "admission attempt");
	await readbackEntered.promise;
	assert(blockedStarted, "the stuck route is genuinely in flight while another target admits");
	await server.root(async (ctx) => {
		const wakes = await ctx.get(WakeStore, {});
		const cancelled = await wakes.cancel({ session: "lost", id: lost.delivery.id }, ctx);
		assert.deepEqual(cancelled.phase, { kind: "uncertain", policy: "readback-only" });
	});
	releaseReadback();
	await poll(async () =>
		server.root(async (ctx) => {
			const row = (await (await ctx.get(WakeStore, {})).list({ session: "lost" }, ctx))[0]!;
			return row.phase.kind === "uncertain";
		}),
	);
	assert.equal(admitCalls, 1, "missing readback does not authorize retry after cancellation");
	await restart();
	await server.root(async (ctx) => {
		const row = (await (await ctx.get(WakeStore, {})).list({ session: "lost" }, ctx))[0]!;
		assert.deepEqual(row.phase, { kind: "uncertain", policy: "readback-only" });
	});
	hide = false;
	releaseReadback();
	await poll(async () =>
		server.root(async (ctx) =>
			["admitted", "settled"].includes(
				(await (await ctx.get(WakeStore, {})).list({ session: "lost" }, ctx))[0]!.phase.kind,
			),
		),
	);
	await restart();
	const conversation = await durable.root(durableCtx);
	await conversation.abort(durableCtx);
	await poll(async () =>
		server.root(
			async (ctx) => (await (await ctx.get(WakeStore, {})).list({ session: "lost" }, ctx))[0]!.phase.kind === "settled",
		),
	);
	assert.equal(admitCalls, 1);
	assert.equal(blocked.delivery.session, "blocked");
	const subscription = await server.root(async (ctx) =>
		(await ctx.get(WakeStore, {})).createSubscription(
			{
				id: "fault-source",
				source: { id: source.id, version: source.version },
				target: { session: "lost", conversation: conversation.id },
				config: {},
			},
			ctx,
		),
	);
	hide = true;
	await server.root(async (ctx) =>
		bindStimulusPublisher(await ctx.get(WakeStore, {}), source, subscription).publish(
			{ eventId: "lost-source-ack", event: { text: "immutable source fault" } },
			ctx,
		),
	);
	await sourceCommitted.promise;
	await server.root(async (ctx) =>
		(await ctx.get(WakeStore, {})).enableSubscription(
			{ id: subscription.id, expectedRevision: 1, enabled: false },
			ctx,
		),
	);
	releaseReadback();
	// Reopen the actual worker SQLite store as well as the server outbox after the lost reply.
	await actual.close();
	await durable.close(durableCtx);
	durable = await openDurable();
	actual = await openActual();
	await restart();
	hide = false;
	releaseReadback();
	await poll(async () =>
		server.root(
			async (ctx) =>
				(
					await bindStimulusPublisher(await ctx.get(WakeStore, {}), source, subscription).receipt(
						{ eventId: "lost-source-ack" },
						ctx,
					)
				).state === "admitted",
		),
	);
	assert.equal(admitCalls, 2, "source readback after restart never readmits a lost ACK");
	const reopenedConversation = await durable.root(durableCtx);
	const native = (await reopenedConversation.entries({}, 100, undefined, durableCtx)).items.filter(
		(entry) => entry.kind === PEER_MESSAGE_ENTRY && JSON.stringify(entry.data).includes("immutable source fault"),
	);
	assert.equal(native.length, 1);
	assert.deepEqual(native[0]!.data, {
		from: { kind: "external", id: source.id, title: source.label },
		text: "immutable source fault",
		stimulus: {
			deliveryId: `source:${JSON.stringify([source.id, source.version, subscription.id, 1, "lost-source-ack"])}`,
			sourceVersion: 1,
			subscriptionId: subscription.id,
			revision: 1,
			eventId: "lost-source-ack",
		},
	});

	await reopenedConversation.abort(durableCtx);
	const ownerAdmin = () => holdIn(server.client({ kind: "owner", access: "local" }), LocalInboxAdmin, {}, "owner");
	let admin = await ownerAdmin();
	const grant = { receipts: true, send: { sessions: "all-private" as const } };
	const provision = () => admin.provision({ grant, bearerHash: "a".repeat(64) }, TEST);
	await provision();
	const peer = "local-inbox";
	const send = (eventId: string) =>
		server.root(async (ctx) =>
			(await ctx.get(WakeStore, {})).sendAddressed({ peer, eventId, session: "lost", text: eventId }, ctx),
		);
	const receipt = (eventId: string) =>
		server.root(async (ctx) => (await ctx.get(WakeStore, {})).receiptAddressed({ peer, eventId }, ctx));
	await send("reserved");
	const stored = () =>
		server.root(async (ctx) =>
			(await ctx.get(WakeStore, {})).addressedRow({ id: 'addressed:["local-inbox","reserved"]' }, ctx),
		);
	await poll(async () => (await stored())?.phase.kind === "uncertain");
	admin.release();
	let readbacks = 0;
	observeReadback = () => {
		readbacks++;
	};
	await restart(false);
	await poll(() => readbacks >= 2);
	observeReadback = () => {};
	await restart();
	admin = await ownerAdmin();
	// Hold the real reservation reply: the server has reserved but the worker cannot have committed.
	const reserved = Promise.withResolvers<void>();
	const resume = Promise.withResolvers<void>();
	t.after(() => resume.resolve());
	const [down, up] = memoryLinkPair();
	server.host.accept(
		{
			close: () => down.close(),
			onMessage: (fn) => down.onMessage(fn),
			onClose: (fn) => down.onClose(fn),
			send(message) {
				if (binaryCodec.decode(message).kind !== "result") return down.send(message);
				reserved.resolve();
				void resume.promise.then(() => down.send(message));
			},
		},
		{ principal: { kind: "worker", session: "lost", generation: 1 } },
		TEST,
	);
	fenceClient.connect(up, { principal: SERVER }, TEST);
	await fenceClient.load([], TEST);
	interruptAdmission = false;
	try {
		await reserved.promise;
		await send("not-reserved");
		await admin.revoke({}, TEST);
		await provision();
		resume.resolve();
		await poll(async () => (await receipt("reserved")).state === "admitted");
		await poll(async () => (await receipt("not-reserved")).state === "blocked");
		await send("next");
		await poll(async () => (await receipt("next")).state === "admitted");
	} finally {
		resume.resolve();
		admin.release();
	}
});
