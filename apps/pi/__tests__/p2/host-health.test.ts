import assert from "node:assert/strict";
import { it } from "node:test";
import { initial, observe, policies, type Cursor } from "../../integrations/host-health/policy.ts";
import { cpuBusy, cpuCounters, memoryAvailable } from "../../integrations/host-health/probes.ts";

const GiB = 1024 ** 3;

const sample = (cursor: Cursor, gib: number, at = 1) => observe(policies["disk-root"], cursor, gib * GiB, at);
const acknowledged = ({ pending: _, ...cursor }: Cursor): Cursor => cursor;

it("debounces low space, escalates immediately, and rearms only after sustained recovery", () => {
	let cursor = sample(initial(), 14);
	cursor = sample(cursor, 15);
	cursor = sample(cursor, 14);
	assert.equal(cursor.pending, undefined);
	cursor = sample(cursor, 14, 4);
	assert.deepEqual(cursor.pending, { at: 4, value: 14 * GiB, threshold: 15 * GiB });
	cursor = sample(acknowledged(cursor), 4, 5);
	assert.equal(cursor.pending?.threshold, 5 * GiB);
	cursor = acknowledged(cursor);
	cursor = sample(sample(sample(cursor, 21), 20), 21);
	assert.equal(sample(cursor, 4).pending, undefined);
	cursor = sample(cursor, 21);
	assert.equal(sample(cursor, 4).sequence, 3);
});

it("does not replace an unacknowledged event after restarting with a newer reading", () => {
	const pending = sample(initial(), 4);
	const reopened: Cursor = JSON.parse(JSON.stringify(pending));
	assert.deepEqual(sample(reopened, 21, 2), pending);
	assert.equal(sample(acknowledged(reopened), 4, 3).pending, undefined);
});

it("CPU needs five consecutive high windows and rearms after recovery", () => {
	const policy = policies.cpu;
	let cursor = initial();
	for (let i = 0; i < 4; i++) cursor = observe(policy, cursor, 9100, i);
	assert.equal(cursor.pending, undefined);
	assert.equal(observe(policy, cursor, undefined, 4).streak, 0);
	cursor = observe(policy, cursor, 9100, 4);
	assert.equal(cursor.pending?.threshold, 9000);
	cursor = acknowledged(cursor);
	assert.equal(observe(policy, cursor, 10000, 5).pending, undefined);
	assert.equal(observe(policy, observe(policy, cursor, 7400, 6), 7400, 7).level, "normal");
});

it("memory warns after three low readings and escalates immediately", () => {
	const policy = policies.memory;
	const twice = observe(policy, observe(policy, initial(), 900, 1), 900, 2);
	assert.equal(twice.pending, undefined);
	const warning = observe(policy, twice, 900, 3);
	assert.equal(warning.pending?.threshold, 1000);
	assert.equal(observe(policy, acknowledged(warning), 250, 4).pending?.threshold, 300);
});

it("uses CPU counter deltas without double-counting guests and uses MemAvailable", () => {
	const before = cpuCounters("cpu 100 0 50 300 10 0 0 0 10 0");
	const after = cpuCounters("cpu 160 0 70 315 15 0 0 0 40 0");
	assert.equal(cpuBusy(before, after), 8000);
	assert.equal(cpuBusy(undefined, after), undefined);
	assert.equal(cpuBusy(after, before), undefined);
	assert.equal(memoryAvailable(["MemTotal: 10000 kB", "MemFree: 100 kB", "MemAvailable: 1700 kB"].join(String.fromCharCode(10))), 1700);
	assert.throws(() => memoryAvailable("MemTotal: 10000 kB"), /Invalid memory/);
});
