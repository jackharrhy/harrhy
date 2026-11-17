// Runnable mailbox adapter example: cd apps/p2 && node --import ./src/source.ts --test test/p2/stimuli-mailbox.test.ts
// UID is the event identity; Message-ID is untrusted data. A cursor advances only after durable publish acknowledgement.
import assert from "node:assert/strict";
import { it } from "node:test";
import { int, obj, str } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT, defineFacet, defineState, local, method } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import {
	bindStimulusPublisher,
	defineStimulusSource,
	StimulusSources,
	sourceKey,
} from "../../plugins/stimuli/contract.server.ts";
import { WakeStore } from "../../plugins/stimuli/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { PEER_MESSAGE_ENTRY } from "../../src/runtime/entries.ts";
import { clientHost, holdIn, localOwner, poll, startFixture, until } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
const Cursor = local("example.mail-cursor", {
	version: 1,
	params: {},
	members: { read: method(obj({}), int()), checkpoint: method(obj({ uid: int() }), int()) },
});
const CursorState = defineState("example.mail-cursor", {
	version: 1,
	schema: obj({ uid: int() }),
	initial: () => ({ uid: 0 }),
	persist: true,
	checkpointWhen: () => true,
});
const cursorFacet = {
	name: "example-mail-cursor",
	facet: defineFacet((host) =>
		host.serve(Cursor, (_params, self) => {
			const saved = self.state(CursorState);
			return {
				read: async () => saved.value.uid,
				checkpoint: async ({ uid }, ctx) => {
					await saved.change((draft) => {
						draft.uid = uid;
					}, ctx);
					return saved.value.uid;
				},
			};
		}),
	),
};

it("replays a durable mailbox cursor, pauses absent sources without blocking timers, and dispatches saved bytes after provider return", async () => {
	let renders = 0;
	const mailbox = defineStimulusSource({
		id: "example.mailbox",
		version: 1,
		label: "Untrusted mailbox change",
		configSchema: obj({ account: str(), rule: str() }),
		eventSchema: obj({ uid: int(), messageId: str(), excerpt: str({ maxLength: 200 }) }),
		render: (event, config) => {
			renders++;
			return `${config.account}/${config.rule}: message ${event.messageId}, UID ${event.uid}; quoted external data: ${event.excerpt}`;
		},
	});
	const sourceFacet = {
		name: "example-mail-source",
		facet: defineFacet((_host, self) => self.contribute(StimulusSources, { [sourceKey(mailbox)]: mailbox })),
	};
	const fixture = await startFixture({ facets: [cursorFacet, sourceFacet] });
	let server = fixture.server;
	let browser = fixture.browser();
	let finalServer: Awaited<ReturnType<typeof startServer>> | undefined;
	try {
		const sessions = await holdIn(browser, Sessions, {}, "owner");
		const session = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		sessions.release();
		const busy = await holdIn(browser, Chat, { session, conversation: 1 }, "participant");
		await busy.send(
			{ text: 'codemode return await tools.bash({command: "printf mailbox-busy; sleep 60"});', requestId: "busy" },
			TEST,
		);
		await until(busy.view, (view) => JSON.stringify(view?.docs["pi.live"]).includes("mailbox-busy"));
		const subscription = await server.host.root(
			async (ctx) =>
				(await ctx.get(WakeStore, {})).createSubscription(
					{
						id: "mailbox",
						source: { id: mailbox.id, version: 1 },
						target: { session, conversation: 1 },
						config: { account: "portable-account", rule: "rule-v1" },
					},
					ctx,
				),
			TEST,
		);
		const first = { uid: 1, messageId: "duplicate-message-id", excerpt: "not an owner command" };
		const second = { ...first, uid: 2 };
		await server.host.root(async (ctx) => {
			const publisher = bindStimulusPublisher(await ctx.get(WakeStore, {}), mailbox, subscription);
			const ack = await publisher.publish({ eventId: "uidvalidity-42:1", event: first }, ctx);
			assert.notEqual(ack.state, "missing");
			// This ordered pair is the adapter's durable progress protocol, not a cross-store transaction.
			await (await ctx.get(Cursor, {})).checkpoint({ uid: 1 }, ctx);
		}, TEST);
		await poll(async () =>
			server.host.root(
				async (ctx) =>
					(
						await bindStimulusPublisher(await ctx.get(WakeStore, {}), mailbox, subscription).receipt(
							{ eventId: "uidvalidity-42:1" },
							ctx,
						)
					).state === "admitted",
				TEST,
			),
		);
		const recorded = await server.host.root(
			async (ctx) =>
				bindStimulusPublisher(await ctx.get(WakeStore, {}), mailbox, subscription).publish(
					{ eventId: "uidvalidity-42:2", event: second },
					ctx,
				),
			TEST,
		);
		assert.equal(recorded.state, "recorded");
		await server.host.root(async (ctx) => {
			const store = await ctx.get(WakeStore, {});
			const disabled = await store.createSubscription(
				{
					id: "disabled-mailbox",
					source: subscription.source,
					target: subscription.target,
					config: subscription.config,
				},
				ctx,
			);
			const publisher = bindStimulusPublisher(store, mailbox, disabled);
			await publisher.publish({ eventId: "never-dispatched", event: { ...first, uid: 3 } }, ctx);
			await store.enableSubscription({ id: disabled.id, expectedRevision: 1, enabled: false }, ctx);
			const replay = await publisher.publish({ eventId: "never-dispatched", event: { ...first, uid: 3 } }, ctx);
			assert.equal(replay.state, "recorded");
			assert.deepEqual(replay.event.phase, { kind: "closed", reason: "cancelled" });
			await assert.rejects(publisher.publish({ eventId: "retired-new", event: { ...first, uid: 4 } }, ctx));
		}, TEST);
		// Crash after recording UID 2, before advancing the adapter cursor.
		busy.release();
		await browser.close(TEST);
		await server.close();
		finalServer = await startServer({
			dataDir: fixture.dataDir,
			port: 0,
			fake: true,
			web: false,
			facets: [cursorFacet],
		});
		server = finalServer;
		browser = clientHost(await localOwner(server));
		await server.host.root(async (ctx) => {
			assert.equal(await (await ctx.get(Cursor, {})).read({}, ctx), 1);
			const publisher = bindStimulusPublisher(await ctx.get(WakeStore, {}), mailbox, subscription);
			const replay = await publisher.publish({ eventId: "uidvalidity-42:2", event: second }, ctx);
			assert.equal(replay.state, "recorded");
			assert.deepEqual(replay.event.envelope, recorded.event.envelope);
			await (await ctx.get(Cursor, {})).checkpoint({ uid: 2 }, ctx);
			await assert.rejects(publisher.publish({ eventId: "uidvalidity-42:3", event: { ...first, uid: 3 } }, ctx));
			await (await ctx.get(WakeStore, {})).register(
				{
					session,
					conversation: 1,
					requestId: "source-absent-timer",
					at: new Date(Date.now() + 100).toISOString(),
					text: "timer progresses without mailbox source",
				},
				ctx,
			);
		}, TEST);
		await poll(async () =>
			server.host.root(
				async (ctx) => (await (await ctx.get(WakeStore, {})).list({ session }, ctx))[0]?.phase.kind === "settled",
				TEST,
			),
		);
		await server.host.root(
			async (ctx) =>
				assert.equal(
					(
						await bindStimulusPublisher(await ctx.get(WakeStore, {}), mailbox, subscription).receipt(
							{ eventId: "uidvalidity-42:2" },
							ctx,
						)
					).state,
					"recorded",
				),
			TEST,
		);
		await browser.close(TEST);
		await server.close();
		// Source return must dispatch the materialized event, not call the replacement renderer.
		const replacement = defineStimulusSource({
			...mailbox,
			render: () => {
				throw new Error("Old events must not render again");
			},
		});
		finalServer = await startServer({
			dataDir: fixture.dataDir,
			port: 0,
			fake: true,
			web: false,
			facets: [
				cursorFacet,
				{
					name: sourceFacet.name,
					facet: defineFacet((_host, self) =>
						self.contribute(StimulusSources, { [sourceKey(mailbox)]: replacement }),
					),
				},
			],
		});
		server = finalServer;
		browser = clientHost(await localOwner(server));
		await poll(async () =>
			server.host.root(
				async (ctx) =>
					(
						await bindStimulusPublisher(await ctx.get(WakeStore, {}), mailbox, subscription).receipt(
							{ eventId: "uidvalidity-42:2" },
							ctx,
						)
					).state === "admitted",
				TEST,
			),
		);
		const chat = await holdIn(browser, Chat, { session, conversation: 1 }, "participant");
		await until(chat.view, (view) =>
			Boolean(
				view?.entries.some(
					(entry) => entry.kind === PEER_MESSAGE_ENTRY && JSON.stringify(entry.data).includes("UID 2"),
				),
			),
		);
		const entries = chat.view.value!.entries.filter(
			(entry) => entry.kind === PEER_MESSAGE_ENTRY && JSON.stringify(entry.data).includes(mailbox.id),
		);
		assert.equal(entries.length, 2, "same Message-ID with distinct native event IDs produces two inputs");
		assert(entries.every((entry) => JSON.stringify(entry.data).includes('"kind":"external"')));
		assert.equal(renders, 3);
		await server.host.root(async (ctx) => assert.equal(await (await ctx.get(Cursor, {})).read({}, ctx), 2), TEST);
		chat.release();
	} finally {
		await browser.close(TEST);
		await finalServer?.close();
		await fixture.close();
	}
});
