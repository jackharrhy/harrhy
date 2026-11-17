// Receipt publication is private, atomic, schema checked and cannot be overwritten by a second terminal.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readReceipt, receiptPath, writeReceipt } from "../../plugins/rex/receipt.ts";

test("private receipt publishes once, accepts the same claim and rejects another pane", async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "p2-rex-receipt-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const receipt = {
		nonce: randomUUID(),
		hostId: randomUUID(),
		endpoint: "unix:///tmp/fixture.sock",
		sessionId: `session:${randomUUID()}`,
		blockId: `block:${randomUUID()}`,
	};
	const path = receiptPath(directory, receipt.nonce);
	assert.equal(await readReceipt(path), undefined);
	await writeReceipt(path, receipt);
	assert.deepEqual(await readReceipt(path), receipt);
	assert.equal((await stat(path)).mode & 0o777, 0o600);
	await writeReceipt(path, receipt);
	await assert.rejects(writeReceipt(path, { ...receipt, blockId: `block:${randomUUID()}` }), /already belongs/);
	assert.deepEqual(await readReceipt(path), receipt);
	await chmod(path, 0o644);
	await assert.rejects(readReceipt(path), /private/);
	await assert.rejects(
		writeReceipt(receiptPath(directory, randomUUID()), { ...receipt, blockId: "invalid" }),
		/Invalid/,
	);
});
