// Two real servers that find and link to each other through a fake `ssh` (both "machines" are this one); disposable stores
// and the fake model: no real SSH, accounts or network.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { BACKGROUND_CONTEXT, whenLive } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { Peers } from "../../integrations/peers/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { PEER_MESSAGE_ENTRY } from "../../src/runtime/entries.ts";
import { APP, expectChord, holdIn, startFixture, until } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
const FAKE_SSH = join(APP, "__tests__", "fixtures", "fake-ssh.mjs");

async function twoPis(t: { after(fn: () => unknown): void }) {
	const state = mkdtempSync(join(tmpdir(), "p2-peers-state-"));
	chmodSync(FAKE_SSH, 0o755);
	const saved = {
		xdg: process.env.XDG_STATE_HOME,
		ssh: process.env.P2_PEERS_SSH,
	};
	process.env.XDG_STATE_HOME = state;
	process.env.P2_PEERS_SSH = FAKE_SSH;
	t.after(() => {
		for (const [key, value] of [
			["XDG_STATE_HOME", saved.xdg],
			["P2_PEERS_SSH", saved.ssh],
		] as const)
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		rmSync(state, { recursive: true, force: true });
	});
	const a = await startFixture({ integrations: ["peers"] });
	t.after(() => a.close());
	const b = await startFixture({ integrations: ["peers"] });
	t.after(() => b.close());
	const peers = {
		a: await holdIn(a.browser(), Peers, {}, "owner"),
		b: await holdIn(b.browser(), Peers, {}, "owner"),
	};
	return { a, b, peers };
}

it(
	"finds a Pi over SSH, links after the other owner approves, and carries messages both ways",
	{ timeout: 120_000 },
	async (t) => {
		const { a, b, peers } = await twoPis(t);
		await until(peers.b.self, (self) => self.id.length > 0);
		const candidates = await peers.a.find({ target: "jack@newport" }, TEST);
		assert.deepEqual(
			candidates.map((candidate) => candidate.instanceId),
			[peers.b.self.value!.id],
			"this Pi is left out",
		);
		await assert.rejects(
			peers.a.find({ target: "not a login" }, TEST),
			/user@host/,
		);
		await assert.rejects(
			peers.a.find({ target: "jack@unknown" }, TEST),
			/does not trust unknown yet/,
		);
		await assert.rejects(
			peers.a.find({ target: "jack@denied" }, TEST),
			/key is not accepted/,
		);

		await peers.a.request(
			{ target: "jack@newport", candidate: candidates[0]! },
			TEST,
		);
		const [request] = await until(
			peers.b.incoming,
			(incoming) => incoming.length === 1,
		);
		assert.equal(request!.name, peers.a.self.value!.name);
		await until(
			peers.a.peers,
			(list) => list[0]?.state === "requested" && list[0].link === "up",
		);
		assert.equal(
			peers.b.peers.value.length,
			0,
			"nothing is linked before the owner approves",
		);

		await peers.b.approve({ id: request!.id }, TEST);
		await until(
			peers.a.peers,
			(list) => list[0]?.state === "connected" && list[0].link === "up",
		);
		await until(
			peers.b.peers,
			(list) => list[0]?.state === "connected" && list[0].link === "up",
		);
		assert.equal(peers.b.incoming.value.length, 0);
		assert.equal(peers.a.peers.value[0]?.ssh, "jack@newport");
		assert.equal(
			peers.b.peers.value[0]?.ssh,
			null,
			"the peer that was asked does not hold the SSH connection",
		);

		// A session on each side, and the agent of each sending to the other.
		const talk = async (fixture: typeof a, title: string) => {
			const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
			const session = await sessions.create(
				{ cwd: fixture.workspace, title },
				TEST,
			);
			const chat = await holdIn(
				fixture.browser(),
				Chat,
				{ session: session.id, conversation: 1 },
				"participant",
			);
			const model = () =>
				(chat.view.value?.entries ?? [])
					.flatMap((entry) => entry.model ?? [])
					.flatMap((message) =>
						typeof message.content === "string"
							? [message.content]
							: message.content.flatMap((part) =>
									part.type === "text" ? [part.text] : [],
								),
					)
					.join("\n");
			const received = () =>
				(chat.view.value?.entries ?? [])
					.filter((entry) => entry.kind === PEER_MESSAGE_ENTRY)
					.map(
						(entry) =>
							entry.data as {
								from: { kind: string; title: string };
								text: string;
							},
					);
			return {
				session,
				chat,
				model,
				received,
				call: (script: string) =>
					chat.send({ text: `codemode ${script}`, requestId: script }, TEST),
			};
		};
		const onA = await talk(a, "Agent on A");
		const onB = await talk(b, "Agent on B");

		await onA.call("return await tools.peer_list({})");
		await until(onA.chat.view, () => onA.model().includes('"up":true'));
		await onA.call(
			`return await tools.peer_send({ peer: ${JSON.stringify(peers.a.peers.value[0]!.name)}, text: "hello from A", session: "${onB.session.id}" })`,
		);
		// B's owner allows the peer only the Familiar by default: a named session is refused.
		await until(onA.chat.view, () =>
			/not permitted|forbidden/i.test(onA.model()),
		);

		await peers.b.setPolicy(
			{ id: peers.b.peers.value[0]!.id, policy: "all-private" },
			TEST,
		);
		await onA.call(
			`return await tools.peer_send({ peer: ${JSON.stringify(peers.a.peers.value[0]!.name)}, text: "second hello from A", session: "${onB.session.id}" })`,
		);
		await until(onB.chat.view, () => onB.received().length === 1);
		assert.equal(onB.received()[0]?.text, "second hello from A");
		assert.equal(onB.received()[0]?.from.kind, "external");

		// The other way: A allows B, B's agent sends.
		await peers.a.setPolicy(
			{ id: peers.a.peers.value[0]!.id, policy: "all-private" },
			TEST,
		);
		await onB.call(
			`return await tools.peer_send({ peer: ${JSON.stringify(peers.b.peers.value[0]!.name)}, text: "hello from B", session: "${onA.session.id}" })`,
		);
		await until(onA.chat.view, () => onA.received().length === 1);
		assert.equal(onA.received()[0]?.text, "hello from B");

		// Ending the link on one side ends it on the other.
		await peers.a.remove({ id: peers.a.peers.value[0]!.id }, TEST);
		await until(peers.a.peers, (list) => list.length === 0);
		await until(peers.b.peers, (list) => list.length === 0);
		for (const chat of [onA.chat, onB.chat]) chat.release();
	},
);

it(
	"keeps a request waiting until the other owner answers, and tells the asker when it is denied",
	{ timeout: 90_000 },
	async (t) => {
		const { peers } = await twoPis(t);
		const [candidate] = await peers.a.find({ target: "jack@newport" }, TEST);
		await peers.a.request(
			{ target: "jack@newport", candidate: candidate! },
			TEST,
		);
		await assert.rejects(
			peers.a.request({ target: "jack@newport", candidate: candidate! }, TEST),
			/already asked/,
		);
		const [request] = await until(
			peers.b.incoming,
			(incoming) => incoming.length === 1,
		);
		await peers.b.deny({ id: request!.id }, TEST);
		const denied = (
			await until(peers.a.peers, (list) => list[0]?.error !== undefined)
		)[0];
		assert.match(denied!.error!, /did not accept/);
		await peers.a.remove({ id: denied!.id }, TEST);
		assert.equal(peers.a.peers.value.length, 0);
		assert.equal(
			peers.b.peers.value.length,
			0,
			"a denied request leaves nothing linked",
		);
	},
);

it("says so when the other SSH server refuses port forwarding", { timeout: 60_000 }, async (t) => {
	const { peers } = await twoPis(t);
	const [candidate] = await peers.a.find({ target: "jack@noforward" }, TEST);
	await peers.a.request({ target: "jack@noforward", candidate: candidate! }, TEST);
	const [refused] = await until(peers.a.peers, (list) => list[0]?.error !== undefined);
	assert.match(refused!.error!, /does not allow port forwarding/);
	assert.equal(peers.b.incoming.value.length, 0);
});

it("lets only the owner see peers", { timeout: 30_000 }, async (t) => {
	const { a } = await twoPis(t);
	const guest = a.as({
		kind: "guest",
		id: "guest",
		name: "Guest",
		home: "x",
		sessions: { x: "full" },
		revision: 1,
	});
	const ref = guest.hold(Peers, {}, TEST);
	await expectChord(whenLive(ref), "forbidden");
	ref.release();
});
