// Runnable admin adapter example: cd apps/p2 && node --import ./src/source.ts --test test/p2/stimuli-sources.test.ts
// A synthetic authenticated actor boundary uses real server/session stores and the disposable model.
import assert from "node:assert/strict";
import { it } from "node:test";
import { obj, str } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT, defineFacet } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Sharing } from "../../plugins/sharing/contract.ts";
import {
	bindStimulusPublisher,
	defineStimulusSource,
	StimulusSources,
	sourceKey,
} from "../../plugins/stimuli/contract.server.ts";
import { Subscriptions, WakeStore } from "../../plugins/stimuli/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { PEER_MESSAGE_ENTRY } from "../../src/runtime/entries.ts";
import { Hosts } from "../../src/runtime/server.ts";
import { clientHost, holdIn, localOwner, poll, startFixture, until } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
it("freezes source intent, scopes bindings, and preserves native provenance across server and worker restart", async () => {
	let renders = 0;
	const admin = defineStimulusSource({
		id: "example.admin",
		version: 1,
		label: "Authenticated admin request",
		configSchema: obj({ resource: str(), actor: str() }),
		eventSchema: obj({ actor: str(), text: str() }),
		render: (event, config) => {
			if (event.actor !== config.actor) throw new Error("Actor not authorized for resource");
			renders++;
			return `${config.resource}: ${event.actor}: ${event.text}`;
		},
	});
	const expanding = defineStimulusSource({
		id: "example.expanding",
		version: 1,
		label: "Expansion",
		configSchema: admin.configSchema,
		eventSchema: admin.eventSchema,
		render: () => "x".repeat(32769),
	});
	const sources = defineFacet((_host, self) =>
		self.contribute(StimulusSources, { [sourceKey(admin)]: admin, [sourceKey(expanding)]: expanding }),
	);
	const facets = [{ name: "example-sources", facet: sources }];
	const fixture = await startFixture({ facets });
	let restarted: Awaited<ReturnType<typeof startServer>> | undefined;
	let browser: ReturnType<typeof clientHost> | undefined;
	try {
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const session = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const other = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const subscriptions = await holdIn(fixture.browser(), Subscriptions, {}, "owner");
		const config = { resource: "site", actor: "reviewed-admin" };
		const subscription = await subscriptions.createTarget(
			{
				id: "admin",
				source: { id: admin.id, version: admin.version },
				target: { session, conversation: 1 },
				config,
			},
			TEST,
		);
		await assert.rejects(
			subscriptions.createTarget(
				{
					id: "bad-target",
					source: { id: admin.id, version: admin.version },
					target: { session, conversation: 99999 },
					config,
				},
				TEST,
			),
		);
		await assert.rejects(
			subscriptions.createTarget(
				{
					id: "bad-config",
					source: { id: admin.id, version: admin.version },
					target: { session, conversation: 1 },
					config: {},
				},
				TEST,
			),
		);
		const guest = fixture.as({
			kind: "guest",
			id: "visitor",
			name: "Visitor",
			home: "test",
			sessions: {},
			revision: 1,
		});
		await assert.rejects(guest.root(async (ctx) => ctx.get(Subscriptions, {}), TEST));
		const stale = fixture.as({ kind: "worker", session, generation: -1 });
		await assert.rejects(
			stale.root(async (ctx) => {
				const ref = await ctx.get(Subscriptions, {});
				if (ref.variant !== "worker") throw new Error("Expected worker");
				await ref.list({}, ctx);
			}, TEST),
		);
		const generation = await fixture.server.host.root(
			async (ctx) => (await ctx.get(Hosts, {})).workers.value[session]!.generation,
			TEST,
		);
		const workerSubscriptions = await holdIn(
			fixture.as({ kind: "worker", session, generation }),
			Subscriptions,
			{},
			"worker",
		);
		const own = await workerSubscriptions.create(
			{ id: "worker-self", source: { id: admin.id, version: admin.version }, conversation: 1, config },
			TEST,
		);
		assert.equal(own.target.session, session);
		assert((await workerSubscriptions.list({}, TEST)).every((row) => row.target.session === session));
		await assert.rejects(
			workerSubscriptions.setEnabled({ id: "not-in-own-session", expectedRevision: 1, enabled: false }, TEST),
		);
		workerSubscriptions.release();
		const event = { actor: "reviewed-admin", text: "Review media" };
		const recorded = await fixture.server.host.root(async (ctx) => {
			const store = await ctx.get(WakeStore, {});
			const publisher = bindStimulusPublisher(store, admin, subscription);
			const replies = await Promise.all(
				Array.from({ length: 8 }, () => publisher.publish({ eventId: "request-1", event }, ctx)),
			);
			assert(replies.every((reply) => reply.state !== "missing"));
			const reordered = await publisher.publish(
				{ eventId: "request-1", event: { text: event.text, actor: event.actor } },
				ctx,
			);
			assert.notEqual(reordered.state, "missing");
			await assert.rejects(publisher.publish({ eventId: "request-1", event: { ...event, text: "changed" } }, ctx));
			await assert.rejects(
				publisher.publish({ eventId: "wrong-actor", event: { ...event, actor: "visitor" } }, ctx),
			);
			await assert.rejects(
				store.publish(
					{
						source: { id: admin.id, version: admin.version },
						subscriptionId: subscription.id,
						revision: 1,
						eventId: "invalid",
						event: {},
					},
					ctx,
				),
			);
			await assert.rejects(
				publisher.publish({ eventId: "oversize", event: { ...event, text: "x".repeat(32769) } }, ctx),
			);
			assert.throws(() => bindStimulusPublisher(store, { ...admin, id: "other-source" }, subscription));
			const expansion = await store.createSubscription(
				{ id: "expansion", source: { id: expanding.id, version: 1 }, target: subscription.target, config },
				ctx,
			);
			const expansionPublisher = bindStimulusPublisher(store, expanding, expansion);
			await assert.rejects(expansionPublisher.publish({ eventId: "too-large-render", event }, ctx));
			assert.deepEqual(await expansionPublisher.receipt({ eventId: "too-large-render" }, ctx), { state: "missing" });
			await assert.rejects(
				store.createSubscription(
					{
						id: "oversize-config",
						source: subscription.source,
						target: subscription.target,
						config: { ...config, resource: "x".repeat(32769) },
					},
					ctx,
				),
			);
			return replies[0]!;
		}, TEST);
		assert.notEqual(recorded.state, "missing");
		const envelope = recorded.event.envelope;
		assert.equal(renders, 1);
		const revised = await subscriptions.reviseTarget(
			{
				id: subscription.id,
				expectedRevision: 1,
				target: { session: other, conversation: 1 },
				config: { ...config, resource: "another-site" },
			},
			TEST,
		);
		assert.equal(revised.revision, 2);
		await fixture.server.host.root(async (ctx) => {
			const publisher = bindStimulusPublisher(await ctx.get(WakeStore, {}), admin, subscription);
			const replay = await publisher.publish({ eventId: "request-1", event }, ctx);
			assert(replay.state !== "missing");
			assert.deepEqual(replay.event.envelope, envelope);
			await assert.rejects(publisher.publish({ eventId: "retired-new", event }, ctx));
		}, TEST);
		const shared = await holdIn(fixture.browser(), Sharing, { session }, "owner");
		await shared.link({ mode: "view" }, TEST);
		await assert.rejects(
			subscriptions.createTarget(
				{
					id: "shared",
					source: { id: admin.id, version: admin.version },
					target: { session, conversation: 1 },
					config,
				},
				TEST,
			),
		);
		shared.release();
		// A fresh enabled revision supplies the event used for native persistence assertions.
		const second = await fixture.server.host.root(
			async (ctx) =>
				bindStimulusPublisher(await ctx.get(WakeStore, {}), admin, revised).publish(
					{ eventId: "request-2", event },
					ctx,
				),
			TEST,
		);
		assert(second.state !== "missing");
		const chat = await holdIn(fixture.browser(), Chat, { session: other, conversation: 1 }, "participant");
		await until(chat.view, (view) => Boolean(view?.entries.some((entry) => entry.kind === PEER_MESSAGE_ENTRY)));
		await poll(async () =>
			fixture.server.host.root(
				async (ctx) =>
					(
						await bindStimulusPublisher(await ctx.get(WakeStore, {}), admin, revised).receipt(
							{ eventId: "request-2" },
							ctx,
						)
					).state === "admitted",
				TEST,
			),
		);
		const disabled = await subscriptions.setEnabled({ id: revised.id, expectedRevision: 2, enabled: false }, TEST);
		assert.equal(disabled.revision, 3);
		chat.release();
		subscriptions.release();
		sessions.release();
		await fixture.server.close();
		// No source provider is needed to read immutable receipts or disable a subscription.
		restarted = await startServer({ dataDir: fixture.dataDir, port: 0, fake: true, web: false });
		browser = clientHost(await localOwner(restarted));
		const restored = await holdIn(browser, Subscriptions, {}, "owner");
		assert.deepEqual((await restored.list({}, TEST))[0]!.config, { ...config, resource: "another-site" });
		await restored.setEnabled({ id: revised.id, expectedRevision: 3, enabled: false }, TEST);
		await restarted.host.root(async (ctx) => {
			const publisher = bindStimulusPublisher(await ctx.get(WakeStore, {}), admin, revised);
			const replay = await publisher.publish({ eventId: "request-2", event }, ctx);
			assert.equal(replay.state, "admitted");
			await assert.rejects(publisher.publish({ eventId: "disabled-new", event }, ctx));
		}, TEST);
		const reopened = await holdIn(browser, Chat, { session: other, conversation: 1 }, "participant");
		await until(reopened.view, Boolean);
		const native = reopened.view.value!.entries.filter((entry) => entry.kind === PEER_MESSAGE_ENTRY);
		assert.equal(native.length, 1);
		assert.deepEqual(native[0]!.data, {
			from: { kind: "external", id: admin.id, title: admin.label },
			text: "another-site: reviewed-admin: Review media",
			stimulus: {
				deliveryId: second.event.envelope.delivery.id,
				sourceVersion: 1,
				subscriptionId: revised.id,
				revision: 2,
				eventId: "request-2",
			},
		});
		assert.equal(renders, 2);
		reopened.release();
		restored.release();
	} finally {
		await browser?.close(TEST);
		await restarted?.close();
		await fixture.close();
	}
});
