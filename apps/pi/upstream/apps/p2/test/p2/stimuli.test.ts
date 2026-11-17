// One-shot wakes exercise real host persistence and native admission with the disposable fake model.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createSession, defineDoc } from "@earendil-works/pi-durable";
import type { Static } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT, expectVariant } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { ExternalIngress, type ReceiptSchema } from "../../plugins/ingress/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Sharing } from "../../plugins/sharing/contract.ts";
import { StimulusWorker, Wakes } from "../../plugins/stimuli/contract.ts";
import { SessionTree } from "../../plugins/tree/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { durableContext } from "../../src/runtime/durable.ts";
import { PEER_MESSAGE_ENTRY } from "../../src/runtime/entries.ts";
import { Hosts } from "../../src/runtime/server.ts";
import { openSessionStorage } from "../../src/runtime/session-store.ts";
import { clientHost, type Fixture, holdIn, localOwner, poll, startFixture, until } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
describe("one-shot wakes", () => {
	let fixture: Fixture;
	let session: string;
	before(async () => {
		fixture = await startFixture();
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		session = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		sessions.release();
	});
	after(async () => fixture?.close());

	it("atomically admits equal concurrent deliveries and preserves native identity after abort and worker replacement", async () => {
		const chat = await holdIn(fixture.browser(), Chat, { session, conversation: 1 }, "participant");
		const delivery = {
			id: "transaction",
			session,
			conversation: 1,
			notBefore: Date.now(),
			text: "native wake",
			intentHash: "transaction-hash",
		};
		const results = await fixture.server.host.root(async (ctx) => {
			const worker = expectVariant(await ctx.get(StimulusWorker, { session }), "server");
			const replies = await Promise.all(Array.from({ length: 8 }, () => worker.admit(delivery, ctx)));
			assert(replies.every((reply) => JSON.stringify(reply) === JSON.stringify(replies[0])));
			assert.equal((await worker.admit({ ...delivery, intentHash: "changed" }, ctx)).state, "conflict");
			return replies;
		}, TEST);
		await until(chat.view, (view) => Boolean(view?.entries.some((entry) => entry.kind === PEER_MESSAGE_ENTRY)));
		assert.equal(chat.view.value!.entries.filter((entry) => entry.kind === PEER_MESSAGE_ENTRY).length, 1);
		await chat.stop(TEST);
		chat.release();
		await fixture.server.host.root(async (ctx) => (await ctx.get(Hosts, {})).stop({ session }, ctx), TEST);
		await fixture.server.host.root(async (ctx) => {
			const worker = expectVariant(await ctx.get(StimulusWorker, { session }), "server");
			assert.deepEqual(await worker.admit(delivery, ctx), results[0]);
			const status = await worker.status({ id: delivery.id, intentHash: delivery.intentHash }, ctx);
			assert(["done", "unanswered"].includes(status.state));
		}, TEST);
	});

	it("reads a seeded pre-extraction ingress receipt without rewriting or readmitting it", async () => {
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const target = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const old = defineDoc<{ events: Record<string, Static<typeof ReceiptSchema>> }>({
			kind: "p2.ingress-receipts",
			version: 1,
			scope: "session",
			initial: () => ({ events: {} }),
			checkpointWhen: () => true,
		});
		const receipt = {
			state: "admitted" as const,
			eventId: "before-extraction",
			contentHash: "original-text-hash",
			submissionId: 123,
		};
		const context = durableContext(new AbortController().signal);
		const stored = await openSessionStorage(fixture.dataDir, target, context);
		const durable = createSession(stored.storage);
		try {
			await durable.commit(async (tx) => {
				(await tx.doc(old)).events[JSON.stringify(["hermes", receipt.eventId])] = receipt;
			}, context);
		} finally {
			await durable.close(context);
			await stored.close();
		}
		await fixture.server.host.root(async (ctx) => {
			const ingress = expectVariant(await ctx.get(ExternalIngress, { session: target }), "server");
			assert.deepEqual(await ingress.receipt({ sender: "hermes", eventId: receipt.eventId }, ctx), receipt);
			assert.deepEqual(
				await ingress.admit(
					{
						sender: "hermes",
						name: "Hermes",
						eventId: receipt.eventId,
						text: "original",
						contentHash: receipt.contentHash,
					},
					ctx,
				),
				receipt,
			);
			assert.equal(
				(
					await ingress.admit(
						{
							sender: "hermes",
							name: "Hermes",
							eventId: receipt.eventId,
							text: "changed",
							contentHash: "changed",
						},
						ctx,
					)
				).state,
				"conflict",
			);
		}, TEST);
		sessions.release();
	});

	it("registers replay-safely, validates offsets, and cancels without starting an idle worker", async () => {
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const target = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const wakes = await holdIn(fixture.browser(), Wakes, {}, "owner");
		const args = {
			session: target,
			conversation: 1,
			requestId: "cancel",
			at: new Date(Date.now() + 60_000).toISOString(),
			text: "cancelled wake",
		};
		const first = await wakes.registerTarget(args, TEST);
		assert.deepEqual(await wakes.registerTarget(args, TEST), first);
		await assert.rejects(wakes.registerTarget({ ...args, text: "changed" }, TEST));
		await assert.rejects(wakes.registerTarget({ ...args, requestId: "ambiguous", at: "2030-01-01T09:00:00" }, TEST));
		const cancelled = await wakes.cancelTarget({ session: target, id: first.delivery.id }, TEST);
		assert.deepEqual(cancelled.phase, { kind: "closed", reason: "cancelled" });
		assert.deepEqual(await wakes.registerTarget(args, TEST), cancelled);
		await fixture.server.host.root(
			async (ctx) => assert.equal((await ctx.get(Hosts, {})).workers.value[target]?.running ?? false, false),
			TEST,
		);
		await sessions.archive({ id: target }, TEST);
		await sessions.restore({ id: target }, TEST);
		assert.deepEqual((await wakes.listTarget({ session: target }, TEST))[0]!.phase, cancelled.phase);
		sessions.release();
		wakes.release();
	});

	it("exposes replay-safe self-scoped tools through the actual code-mode tool selection", async () => {
		const chat = await holdIn(fixture.browser(), Chat, { session, conversation: 1 }, "participant");
		const wakes = await holdIn(fixture.browser(), Wakes, {}, "owner");
		const at = new Date(Date.now() + 60_000).toISOString();
		await chat.send(
			{
				text: `codemode return await tools.wake_at(${JSON.stringify({ at, text: "tool-created wake" })});`,
				requestId: "wake-tool",
			},
			TEST,
		);
		await poll(async () =>
			(await wakes.listTarget({ session }, TEST)).some((row) => row.delivery.text === "tool-created wake"),
		);
		const row = (await wakes.listTarget({ session }, TEST)).find(
			(each) => each.delivery.text === "tool-created wake",
		)!;
		assert.equal(row.delivery.conversation, 1);
		await until(chat.view, (view) => !(view?.docs["pi.live"] as { run?: unknown })?.run);
		await chat.send(
			{
				text: `codemode return [await tools.wake_list({}), await tools.wake_cancel(${JSON.stringify({ id: row.delivery.id })})];`,
				requestId: "cancel-tool",
			},
			TEST,
		);
		await poll(
			async () =>
				(await wakes.listTarget({ session }, TEST)).find((each) => each.delivery.id === row.delivery.id)?.phase
					.kind === "closed",
		);
		chat.release();
		wakes.release();
	});

	it("blocks new registrations in shared sessions and closes scheduled wakes when privacy changes", async () => {
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const target = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const wakes = await holdIn(fixture.browser(), Wakes, {}, "owner");
		const args = {
			session: target,
			conversation: 1,
			requestId: "private",
			at: new Date(Date.now() + 60_000).toISOString(),
			text: "private wake",
		};
		const row = await wakes.registerTarget(args, TEST);
		const sharing = await holdIn(fixture.browser(), Sharing, { session: target }, "owner");
		await sharing.link({ mode: "view" }, TEST);
		await assert.rejects(wakes.registerTarget({ ...args, requestId: "shared" }, TEST));
		await poll(
			async () =>
				(await wakes.listTarget({ session: target }, TEST)).find((each) => each.delivery.id === row.delivery.id)
					?.phase.kind === "closed",
		);
		sharing.release();
		wakes.release();
		sessions.release();
	});

	it("does not redirect a saved wake when the main branch changes", async () => {
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const target = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const wakes = await holdIn(fixture.browser(), Wakes, {}, "owner");
		const tree = await holdIn(fixture.browser(), SessionTree, { session: target }, "owner");
		const original = await holdIn(fixture.browser(), Chat, { session: target, conversation: 1 }, "participant");
		await original.send({ text: "branch seed", requestId: "branch-seed" }, TEST);
		await until(
			original.view,
			(view) => Boolean(view?.entries.length) && !(view?.docs["pi.live"] as { run?: unknown })?.run,
		);
		original.release();
		const row = await wakes.registerTarget(
			{
				session: target,
				conversation: 1,
				requestId: "saved-branch",
				at: new Date(Date.now() + 500).toISOString(),
				text: "do not redirect",
			},
			TEST,
		);
		const branch = await tree.branch({ conversation: 1, label: "new main" }, TEST);
		await poll(async () => (await wakes.listTarget({ session: target }, TEST))[0]?.phase.kind === "uncertain");
		const saved = (await wakes.listTarget({ session: target }, TEST))[0]!;
		assert.equal(saved.delivery.conversation, row.delivery.conversation);
		assert.deepEqual(saved.phase, { kind: "uncertain", policy: "readback-only" });
		const chat = await holdIn(
			fixture.browser(),
			Chat,
			{ session: target, conversation: branch.conversation },
			"participant",
		);
		await until(chat.view, Boolean);
		assert(!chat.view.value!.entries.some((entry) => entry.kind === PEER_MESSAGE_ENTRY));
		chat.release();
		tree.release();
		wakes.release();
		sessions.release();
	});

	it("retains an admitted native queue obligation across restart and serializes later wakes", async () => {
		const isolated = await startFixture();
		let restarted: Awaited<ReturnType<typeof startServer>> | undefined;
		let browser: ReturnType<typeof clientHost> | undefined;
		try {
			const sessions = await holdIn(isolated.browser(), Sessions, {}, "owner");
			const target = (await sessions.create({ cwd: isolated.workspace }, TEST)).id;
			sessions.release();
			const chat = await holdIn(isolated.browser(), Chat, { session: target, conversation: 1 }, "participant");
			await chat.send(
				{ text: 'codemode return await tools.bash({command: "printf wake-busy; sleep 60"});', requestId: "busy" },
				TEST,
			);
			await until(chat.view, (view) => JSON.stringify(view?.docs["pi.live"]).includes("wake-busy"));
			const wakes = await holdIn(isolated.browser(), Wakes, {}, "owner");
			const at = new Date(Date.now() + 100).toISOString();
			const first = await wakes.registerTarget(
				{ session: target, conversation: 1, requestId: "first", at, text: "first queued wake" },
				TEST,
			);
			const second = await wakes.registerTarget(
				{ session: target, conversation: 1, requestId: "second", at, text: "second queued wake" },
				TEST,
			);
			await poll(
				async () =>
					(await wakes.listTarget({ session: target }, TEST)).find((row) => row.delivery.id === first.delivery.id)
						?.phase.kind === "admitted",
			);
			assert.equal(
				(await wakes.listTarget({ session: target }, TEST)).find((row) => row.delivery.id === second.delivery.id)
					?.phase.kind,
				"scheduled",
			);
			await until(chat.view, (view) => JSON.stringify(view?.docs["pi.inbox"]).includes("first queued wake"));
			chat.release();
			wakes.release();
			await isolated.server.close();
			restarted = await startServer({ dataDir: isolated.dataDir, port: 0, fake: true, web: false });
			browser = clientHost(await localOwner(restarted));
			const restored = await holdIn(browser, Wakes, {}, "owner");
			await poll(async () =>
				(await restored.listTarget({ session: target }, TEST)).every((row) => row.phase.kind === "settled"),
			);
			const rows = await restored.listTarget({ session: target }, TEST);
			assert.equal(rows.length, 2);
			assert.equal(rows.find((row) => row.delivery.id === first.delivery.id)!.phase.kind, "settled");
			restored.release();
		} finally {
			await browser?.close(TEST);
			await restarted?.close();
			await isolated.close();
		}
	});

	it("restores overdue wakes after server restart and delivers once to the persisted conversation", async () => {
		const wakes = await holdIn(fixture.browser(), Wakes, {}, "owner");
		const args = {
			session,
			conversation: 1,
			requestId: "restart",
			at: new Date(Date.now() + 1000).toISOString(),
			text: "wake after restart",
		};
		const row = await wakes.registerTarget(args, TEST);
		wakes.release();
		await fixture.server.close();
		const server = await startServer({ dataDir: fixture.dataDir, port: 0, fake: true, web: false });
		const browser = clientHost(await localOwner(server));
		try {
			const restored = await holdIn(browser, Wakes, {}, "owner");
			await poll(async () =>
				(await restored.listTarget({ session }, TEST)).some(
					(each) => each.delivery.id === row.delivery.id && each.phase.kind === "settled",
				),
			);
			const chat = await holdIn(browser, Chat, { session, conversation: 1 }, "participant");
			await until(chat.view, (view) =>
				Boolean(
					view?.entries.some(
						(entry) => entry.kind === PEER_MESSAGE_ENTRY && JSON.stringify(entry.data).includes(args.text),
					),
				),
			);
			assert.equal(
				chat.view.value!.entries.filter(
					(entry) => entry.kind === PEER_MESSAGE_ENTRY && JSON.stringify(entry.data).includes(args.text),
				).length,
				1,
			);
			assert.equal((await restored.registerTarget(args, TEST)).delivery.id, row.delivery.id);
			chat.release();
			restored.release();
		} finally {
			await browser.close(TEST);
			await server.close();
		}
	});
});
