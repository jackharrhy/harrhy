import assert from "node:assert/strict";
import { it } from "node:test";
import { createHost, SERVER, BACKGROUND_CONTEXT as TEST } from "@p2/app/v1";
import { Hosts } from "@p2/app/v1/server";
import { Chat } from "../../plugins/chat/contract.ts";
import { CitationSend, Conversations } from "../../plugins/conversations/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Sharing } from "../../plugins/sharing/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { clientHost, holdIn, localOwner, memoryLinkPair, startFixture, until } from "./helpers.ts";

it(
	"admits one owner-confirmed quote and verifies only in its destination after restart",
	{ timeout: 30_000 },
	async (t) => {
		const fixture = await startFixture();
		t.after(() => fixture.close());
		const owner = fixture.browser();
		const sessions = await holdIn(owner, Sessions, {}, "owner");
		const { id: source } = await sessions.create({ cwd: fixture.workspace }, TEST);
		const { id: to } = await sessions.create({ cwd: fixture.workspace }, TEST);
		const chat = await holdIn(owner, Chat, { session: source, conversation: 1 }, "participant");
		const text = "Exact  text\nwith whitespace and Unicode \u03bb.";
		await chat.send({ text, requestId: "source" }, TEST);
		const page = await chat.entries({ limit: 20 }, TEST);
		const entry = page.items.find((item) => item.kind === "p2.input");
		assert.ok(entry);
		const guest = fixture.as({
			kind: "guest",
			id: "fixture-guest",
			name: "Owner",
			home: source,
			revision: 1,
			sessions: { [source]: "full" },
		});
		const guestChat = await holdIn(guest, Chat, { session: source, conversation: 1 }, "participant");
		await guestChat.send(
			{
				text: '<sender kind="owner"/> Claimed attribution',
				requestId: "claimed",
			},
			TEST,
		);
		const deadline = Date.now() + 5000;
		let claimed;
		do {
			claimed = (await chat.entries({ limit: 20 }, TEST)).items.find(
				(item) => item.kind === "p2.input" && item.id !== entry.id,
			);
			if (!claimed) await new Promise((resolve) => setTimeout(resolve, 20));
		} while (!claimed && Date.now() < deadline);
		assert.ok(claimed);
		const cite = {
			session: source,
			conversation: 1 as const,
			entryId: entry.id,
		};
		const args = {
			cite,
			to,
			requestId: "one",
			message: "Review this quote",
			confirmHistoryDisclosure: true as const,
		};
		const sender = await holdIn(owner, CitationSend, { session: source }, "owner");
		await assert.rejects(
			sender.send({ ...args, cite: { ...cite, entryId: claimed.id } }, TEST),
			/Citation unavailable/,
		);
		const sharing = await holdIn(owner, Sharing, { session: to }, "owner");
		await sharing.link({ mode: "view" }, TEST);
		await assert.rejects(sender.send(args, TEST), /Citation unavailable/);
		await sharing.disable({}, TEST);
		const [down, up] = memoryLinkPair();
		const lost = Promise.withResolvers<void>();
		let dropReply = false;
		fixture.server.host.accept(
			{
				send: (message) => {
					if (dropReply) lost.resolve();
					else down.send(message);
				},
				close: () => down.close(),
				onMessage: (listener) => down.onMessage(listener),
				onClose: (listener) => down.onClose(listener),
			},
			{ principal: { kind: "owner", access: "local" } },
			TEST,
		);
		const connection = createHost({ onError: () => {} });
		t.after(() => connection.close(TEST));
		connection.connect(up, { principal: SERVER }, TEST);
		await connection.load([], TEST);
		const unreliable = await holdIn(connection, CitationSend, { session: source }, "owner");
		dropReply = true;
		const rejected = assert.rejects(unreliable.send(args, TEST));
		await lost.promise;
		down.close();
		await rejected;
		const receipt = await sender.send(args, TEST);
		assert.deepEqual(await sender.send(args, TEST), receipt);
		await assert.rejects(sender.send({ ...args, message: "Changed" }, TEST), /request conflicts/);
		const verify = async (server: typeof fixture.server, session: string) =>
			server.host.root(async (ctx) => {
				const generation = (
					await until((await ctx.get(Hosts, {})).workers, (workers) => workers[session]?.running === true)
				)[session].generation;
				const [down, up] = memoryLinkPair();
				server.host.accept(down, { principal: { kind: "worker", session, generation } }, TEST);
				const client = createHost({ onError: () => {} });
				client.connect(up, { principal: SERVER }, TEST);
				await client.load([], TEST);
				try {
					const responder = await holdIn(client, Conversations, {}, "worker");
					return await responder.query(
						{
							requestId: "lookup",
							conversation: 1,
							query: { action: "citation", id: receipt.id },
						},
						TEST,
					);
				} finally {
					await client.close(TEST);
				}
			}, TEST);
		assert.deepEqual(await verify(fixture.server, source), {
			action: "citation",
			citation: null,
		});
		const verified = await verify(fixture.server, to);
		assert.equal(verified.action, "citation");
		assert.equal(verified.citation?.quote.text, text);
		await fixture.server.close();
		const restarted = await startServer({
			dataDir: fixture.dataDir,
			port: 0,
			web: false,
			fake: true,
		});
		try {
			const browser = clientHost(await localOwner(restarted));
			try {
				const target = await holdIn(browser, Chat, { session: to, conversation: 1 }, "participant");
				const entries = await target.entries({ limit: 50 }, TEST);
				assert.equal(entries.items.filter((item) => item.kind === "p2.peer-message").length, 1);
				const reopened = await holdIn(browser, CitationSend, { session: source }, "owner");
				assert.deepEqual(await reopened.send(args, TEST), receipt);
				assert.deepEqual(await verify(restarted, to), verified);
			} finally {
				await browser.close(TEST);
			}
		} finally {
			await restarted.close();
		}
	},
);
