// External ingress uses disposable fake sessions, never a live Familiar or provider.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { Familiar } from "../../plugins/familiar/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { PEER_MESSAGE_ENTRY } from "../../src/runtime/entries.ts";
import { Hosts } from "../../src/runtime/server.ts";
import { buildTranscript } from "../../src/web/transcript.ts";
import { wholeView } from "../fixtures/whole-view.ts";
import { APP, type Fixture, holdIn, http, startFixture, until } from "./helpers.ts";

const token = "disposable-ingress-fixture-token";
const path = "/api/ingress/v1/events";
describe("external ingress", () => {
	let fixture: Fixture;
	let session: string;
	before(async () => {
		fixture = await startFixture({ allowedHosts: ["share.test"] });
		const owner = fixture.browser();
		const familiar = await holdIn(owner, Familiar, {}, "owner");
		session = (await familiar.open(BACKGROUND_CONTEXT)).id;
		await writeFile(
			join(fixture.dataDir, "ingress.json"),
			JSON.stringify({
				sender: "hermes",
				name: 'Hermes "nano"',
				session,
				tokenHash: createHash("sha256").update(token).digest("hex"),
			}),
			{ mode: 0o600 },
		);
	});
	after(async () => {
		await fixture?.close();
	});
	const send = (eventId: string, text: string) =>
		http(fixture.server.port, path, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: JSON.stringify({ eventId, text }),
		});
	const receipt = (id: string) =>
		http(fixture.server.port, `/api/ingress/v1/receipts/${id}`, { headers: { Authorization: `Bearer ${token}` } });

	it("requires a dedicated token, rejects cookies, retargeting and remote requests", async () => {
		assert.equal((await fixture.http(path, { method: "POST", body: "{}" })).status, 401);
		assert.equal(
			(await http(fixture.server.port, "/__p2_tui", { headers: { Authorization: `Bearer ${token}` } })).status,
			401,
		);
		assert.equal(
			(await http(fixture.server.port, path, { method: "POST", headers: { Authorization: "Bearer wrong" } })).status,
			401,
		);
		assert.equal(
			(
				await http(fixture.server.port, path, {
					method: "POST",
					headers: { Host: "share.test", Authorization: `Bearer ${token}` },
				})
			).status,
			403,
		);
		assert.equal(
			(
				await http(fixture.server.port, path, {
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
					body: JSON.stringify({ eventId: "bad", text: "x", session: "other" }),
				})
			).status,
			400,
		);
	});
	it("disables without configuration and revokes the dedicated credential without owner changes", async () => {
		const file = join(fixture.dataDir, "ingress.json");
		const config = await readFile(file, "utf8");
		await rename(file, `${file}.disabled`);
		try {
			assert.equal((await send("disabled", "not admitted")).status, 404);
		} finally {
			await rename(`${file}.disabled`, file);
		}
		await writeFile(
			file,
			JSON.stringify({
				...JSON.parse(config),
				tokenHash: createHash("sha256").update("rotated-token").digest("hex"),
			}),
		);
		try {
			assert.equal((await send("revoked", "not admitted")).status, 401);
		} finally {
			await writeFile(file, config);
		}
		assert.equal((await receipt("disabled")).status, 404);
		assert.equal((await receipt("revoked")).status, 404);
	});

	it("atomically admits concurrent equal retries, conflicts on changed content and reads immutable admission receipts", async () => {
		const replies = await Promise.all(Array.from({ length: 8 }, () => send("equal", "substantive external message")));
		for (const reply of replies) {
			assert.equal(reply.status, 200, reply.body);
			assert.equal(reply.body, replies[0]!.body);
		}
		assert.equal(JSON.parse(replies[0]!.body).state, "admitted");
		assert.equal((await send("equal", "changed")).status, 409);
		assert.equal((await receipt("equal")).body, replies[0]!.body);
		assert.equal((await receipt("unknown")).status, 404);
		const chat = await holdIn(fixture.browser(), Chat, { session, conversation: 1 }, "participant");
		const view = await until(chat.view, (view) =>
			Boolean(view?.entries.some((entry) => entry.kind === PEER_MESSAGE_ENTRY)),
		);
		const peers = view!.entries.filter((entry) => entry.kind === PEER_MESSAGE_ENTRY);
		assert.equal(peers.length, 1);
		assert.deepEqual(peers[0]!.data, {
			from: { kind: "external", id: "hermes", title: 'Hermes "nano"' },
			text: "substantive external message",
		});
		assert.match(JSON.stringify(peers[0]!.model), /kind=\\"external\\"/);
		assert.match(JSON.stringify(peers[0]!.model), /&quot;nano&quot;/);
		await until(chat.view, (view) => !(view?.docs["pi.live"] as { run?: unknown })?.run);
		chat.release();
		await fixture.server.host.root(
			async (ctx) => (await ctx.get(Hosts, {})).stop({ session }, ctx),
			BACKGROUND_CONTEXT,
		);
		// Discarding the first HTTP reply models a lost ACK: the stable ID survives a new worker.
		assert.equal((await send("equal", "substantive external message")).body, replies[0]!.body);
		assert.equal((await receipt("equal")).body, replies[0]!.body);
	});
	it("runs the standalone client without checkout imports", async () => {
		const tokenFile = join(fixture.dataDir, "client-token");
		await writeFile(tokenFile, token, { mode: 0o600 });
		const client = join(fixture.dataDir, "standalone-client.py");
		await copyFile(join(APP, "scripts/ingress.py"), client);
		const args = [
			client,
			"portable-client",
			"--url",
			`http://127.0.0.1:${fixture.server.port}`,
			"--token-file",
			tokenFile,
		];
		const sent = await promisify(execFile)("python3", [...args, "--text", "Portable evidence review"]);
		const read = await promisify(execFile)("python3", [...args, "--receipt"]);
		assert.equal(sent.stdout, read.stdout);
		assert.equal(JSON.parse(sent.stdout).state, "admitted");
	});

	it("queues behind busy tools and never resurrects stopped work on retry", async () => {
		const chat = await holdIn(fixture.browser(), Chat, { session, conversation: 1 }, "participant");
		await chat.send(
			{
				text: 'codemode return await tools.bash({command: "printf tool-running; sleep 4; printf tool-finished"});',
				requestId: "owner-busy",
			},
			BACKGROUND_CONTEXT,
		);
		const before = await until(chat.view, (view) => JSON.stringify(view?.docs["pi.live"]).includes("tool-running"));
		const admitted = await send("busy-followup", "Review after the current tool finishes");
		assert.equal(admitted.status, 200, admitted.body);
		const view = await until(chat.view, (view) => JSON.stringify(view?.docs["pi.inbox"]).includes("Review after"));
		assert.ok(
			buildTranscript(wholeView(view!)).queued.some((item) =>
				item.text.startsWith('Hermes "nano" (external peer):'),
			),
		);
		assert.deepEqual(
			(view?.docs["pi.live"] as { run?: { inputs: unknown } })?.run?.inputs,
			(before?.docs["pi.live"] as { run?: { inputs: unknown } })?.run?.inputs,
			"ingress preserves the active run",
		);
		await chat.stop(BACKGROUND_CONTEXT);
		await until(chat.view, (view) => !(view?.docs["pi.live"] as { run?: unknown })?.run);
		assert.equal((await receipt("busy-followup")).body, admitted.body, "admission is not a read/completion claim");
		assert.equal((await send("busy-followup", "Review after the current tool finishes")).body, admitted.body);
		assert.ok(!JSON.stringify(chat.view.value?.docs["pi.inbox"]).includes("Review after"));
		chat.release();
	});
	it("retains admission after a full server restart", async () => {
		const original = await receipt("equal");
		await fixture.server.close();
		const restarted = await startServer({ dataDir: fixture.dataDir, port: 0, fake: true, web: false });
		try {
			const headers = { Authorization: `Bearer ${token}` };
			const read = await http(restarted.port, "/api/ingress/v1/receipts/equal", { headers });
			assert.equal(read.status, 200, read.body);
			assert.equal(read.body, original.body);
			const retried = await http(restarted.port, path, {
				method: "POST",
				headers,
				body: JSON.stringify({ eventId: "equal", text: "substantive external message" }),
			});
			assert.equal(retried.body, original.body);
			assert.equal(
				(
					await http(restarted.port, path, {
						method: "POST",
						headers,
						body: JSON.stringify({ eventId: "equal", text: "changed after restart" }),
					})
				).status,
				409,
			);
		} finally {
			await restarted.close();
		}
	});
});
