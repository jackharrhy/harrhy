// Private receipts preserve crash recovery and clean visible titles without claiming unrelated panes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import type { RexBlock } from "../../plugins/rex/cli.ts";
import type { RexState } from "../../plugins/rex/config.ts";
import { receiptPath, writeReceipt } from "../../plugins/rex/receipt.ts";
import { type CatalogSession, type RexAdapter, reconcile } from "../../plugins/rex/reconcile.ts";

const config = {
	endpoint: "unix:///tmp/rex-test.sock",
	sessionId: "session:00000000-0000-4000-8000-000000000001",
	hostId: "00000000-0000-4000-8000-000000000002",
};
async function fixture(t: TestContext) {
	const directory = await mkdtemp(join(tmpdir(), "p2-rex-reconcile-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const launch = { app: "/tmp/app", dataDir: join(directory, "private data"), url: "http://127.0.0.1:12345" };
	const state: RexState = { namespace: randomUUID(), targets: {} };
	const blocks: RexBlock[] = [];
	let creates = 0,
		lose = false,
		saves = 0;
	const client: RexAdapter = {
		identity: async () => ({ hostId: config.hostId, instanceId: randomUUID(), endpoint: config.endpoint }),
		view: async () => ({ blocks }),
		create: async (input) => {
			assert.equal(input.command[3], `P2_DATA_DIR=${launch.dataDir}`);
			assert(!input.label.includes("[p2:"));
			assert(saves > 0, "intent committed before dispatch");
			creates++;
			const block = {
				blockId: `block:${randomUUID()}`,
				windowId: `window:${randomUUID()}`,
				label: input.label,
				windowLabel: input.label,
			};
			blocks.push(block);
			await writeReceipt(input.command[8]!, {
				nonce: input.command[9],
				hostId: config.hostId,
				endpoint: config.endpoint,
				sessionId: config.sessionId,
				blockId: block.blockId,
			});
			if (lose) {
				lose = false;
				throw new Error("lost response");
			}
			return block;
		},
		close: async (_session, id) => {
			const index = blocks.findIndex((block) => block.blockId === id);
			assert(index >= 0);
			blocks.splice(index, 1);
		},
		rename: async (_session, id, label) => {
			blocks.find((block) => block.blockId === id)!.label = label;
		},
		renameWindow: async (_session, id, label) => {
			blocks.find((block) => block.windowId === id)!.windowLabel = label;
		},
	};
	const pass = (rows: readonly CatalogSession[]) =>
		reconcile(
			client,
			config,
			state,
			rows,
			launch,
			async () => {
				saves++;
			},
			() => {},
		);
	return {
		state,
		blocks,
		client,
		launch,
		pass,
		loseNext: () => {
			lose = true;
		},
		creates: () => creates,
		mappings: () => Object.values(state.targets)[0]!,
	};
}

test("serial backfill adopts lost replies by receipt, not title, and keeps exact titles", async (t) => {
	const f = await fixture(t);
	const rows = [
		{ id: "a", title: "First", archivedAt: null },
		{ id: "b".repeat(128), title: "Second", archivedAt: null },
	];
	f.loseNext();
	await assert.rejects(f.pass(rows), /lost response/);
	await f.pass(rows);
	assert.equal(f.creates(), 2);
	assert.equal(f.blocks.length, 2);
	assert.equal(f.blocks[0]!.label, "First");
	await f.pass(rows);
	assert.equal(f.creates(), 2);
	await f.pass([{ ...rows[0]!, title: "Renamed" }, rows[1]!]);
	assert.equal(f.blocks[0]!.label, "Renamed");
	assert.equal(f.blocks[0]!.windowLabel, "Renamed");
});

test("manual close stays suppressed until archive/restore; unmanaged names stay untouched", async (t) => {
	const f = await fixture(t);
	const live = [{ id: "a", title: "Same title", archivedAt: null }];
	f.blocks.push({ blockId: "logs", windowId: "logs", label: "Same title" });
	await f.pass(live);
	f.blocks.splice(1, 1);
	await f.pass(live);
	await f.pass(live);
	assert.equal(f.creates(), 1);
	await f.pass([{ id: "a", archivedAt: 1 }]);
	await f.pass(live);
	assert.equal(f.creates(), 2);
	await f.pass([{ id: "a", archivedAt: 2 }]);
	assert.deepEqual(f.blocks, [{ blockId: "logs", windowId: "logs", label: "Same title" }]);
});

test("known marker mappings migrate in place and window rename failures can retry", async (t) => {
	const f = await fixture(t);
	const marker = "[p2:previous-marker]";
	f.blocks.push({
		blockId: "known",
		windowId: "known-window",
		label: `Ask Pi ${marker}`,
		windowLabel: `Ask Pi ${marker}`,
	});
	const key = JSON.stringify([config.endpoint, config.hostId, config.sessionId]);
	f.state.targets[key] = { a: { label: marker, phase: "open", blockId: "known", windowId: "known-window" } };
	const rename = f.client.renameWindow;
	f.client.renameWindow = async () => {
		throw new Error("rename interrupted");
	};
	await assert.rejects(f.pass([{ id: "a", title: "Ask Pi", archivedAt: null }]), /interrupted/);
	// Block rename committed before the failed tab rename; retry still owns the exact block.
	f.client.renameWindow = rename;
	await f.pass([{ id: "a", title: "Ask Pi", archivedAt: null }]);
	assert.equal(f.blocks[0]!.label, "Ask Pi");
	assert.equal(f.blocks[0]!.windowLabel, "Ask Pi");
	assert.equal(f.creates(), 0);
});

test("stale/invalid receipts and absent live blocks never cause adoption or duplicate creation", async (t) => {
	const f = await fixture(t);
	const rows = [{ id: "a", title: "A", archivedAt: null }];
	f.loseNext();
	await assert.rejects(f.pass(rows), /lost response/);
	const mapping = f.mappings().a!;
	const path = receiptPath(f.launch.dataDir, mapping.nonce!);
	const receipt = JSON.parse(await readFile(path, "utf8"));
	await writeFile(path, JSON.stringify({ ...receipt, hostId: randomUUID() }));
	await assert.rejects(f.pass(rows), /pending target/);
	await writeFile(path, "{}");
	await assert.rejects(f.pass(rows), /Invalid/);
	await writeFile(path, JSON.stringify(receipt));
	f.blocks.length = 0;
	await f.pass(rows);
	await f.pass(rows);
	assert.equal(f.creates(), 1);
});

test("explicit relocation closes only its acknowledged block and recovers a lost close reply", async (t) => {
	const f = await fixture(t);
	const rows = [{ id: "a", archivedAt: null }];
	await f.pass(rows);
	const mapping = f.mappings().a!;
	mapping.phase = "relocating";
	mapping.destination = `session:${randomUUID()}`;
	const close = f.client.close;
	f.client.close = async (session, id) => {
		await close(session, id);
		throw new Error("lost close reply");
	};
	await assert.rejects(f.pass(rows), /lost close reply/);
	assert.equal(mapping.phase, "relocating");
	assert.equal(f.blocks.length, 0);
	f.client.close = close;
	await f.pass(rows);
	assert.equal(mapping.phase, "archived");
	assert.equal(mapping.blockId, undefined);
	assert.equal(mapping.destination, undefined);
	assert.equal(f.creates(), 1, "relocation does not launch in the old target");
});

test("relocation refuses a missing destination and uncertain creates; global budget defers creation", async (t) => {
	const f = await fixture(t);
	const rows = [{ id: "a", archivedAt: null }];
	await f.pass(rows);
	const mapping = f.mappings().a!;
	mapping.phase = "relocating";
	mapping.destination = `session:${randomUUID()}`;
	f.client.view = async (id) => (id === config.sessionId ? { blocks: f.blocks } : undefined);
	await assert.rejects(f.pass(rows), /destination is missing/);
	assert.equal(f.blocks.length, 1);
	delete mapping.blockId;
	await assert.rejects(f.pass(rows), /acknowledged block/);
	const g = await fixture(t);
	await reconcile(
		g.client,
		config,
		g.state,
		rows,
		g.launch,
		async () => {},
		() => {},
		{ remaining: 0 },
	);
	assert.equal(g.creates(), 0);
});

test("missing target, identity mismatch and cancellation never create", async (t) => {
	const f = await fixture(t);
	f.client.view = async () => undefined;
	await assert.rejects(f.pass([{ id: "a", archivedAt: null }]), /missing/);
	f.client.identity = async () => ({ hostId: "other", instanceId: randomUUID(), endpoint: config.endpoint });
	await assert.rejects(f.pass([]), /identity/);
	assert.equal(f.creates(), 0);
	const g = await fixture(t);
	await assert.rejects(
		reconcile(
			g.client,
			config,
			g.state,
			[{ id: "a", archivedAt: null }],
			g.launch,
			async () => {},
			() => {
				throw new Error("cancelled");
			},
		),
		/cancelled/,
	);
	assert.equal(g.creates(), 0);
});
