import assert from "node:assert/strict";
import { it } from "node:test";
import { GiB, initial, observe, type Cursor } from "../../integrations/host-health/disk.ts";

const sample = (cursor: Cursor, gib: number, at = 1) => observe(cursor, gib * GiB, at);
const acknowledged = ({ pending: _, ...cursor }: Cursor): Cursor => cursor;

it("debounces low space, escalates immediately, and rearms only after sustained recovery", () => {
	let cursor = sample(initial(), 14);
	cursor = sample(cursor, 15);
	cursor = sample(cursor, 14);
	assert.equal(cursor.pending, undefined);
	cursor = sample(cursor, 14, 4);
	assert.deepEqual(cursor.pending, { id: 1, at: 4, available: 14 * GiB, threshold: 15 * GiB });
	cursor = sample(acknowledged(cursor), 4, 5);
	assert.equal(cursor.pending?.threshold, 5 * GiB);
	cursor = acknowledged(cursor);
	cursor = sample(sample(sample(cursor, 21), 20), 21);
	assert.equal(sample(cursor, 4).pending, undefined);
	cursor = sample(cursor, 21);
	assert.equal(sample(cursor, 4).pending?.id, 3);
});

it("does not replace an unacknowledged event after restarting with a newer reading", () => {
	const pending = sample(initial(), 4);
	const reopened: Cursor = JSON.parse(JSON.stringify(pending));
	assert.deepEqual(sample(reopened, 21, 2), pending);
	assert.equal(sample(acknowledged(reopened), 4, 3).pending, undefined);
});
