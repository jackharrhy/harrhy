import assert from "node:assert/strict";
import { it } from "node:test";
import { initial, observe, policyFor, presets, type Cursor } from "../../integrations/host-health/policy.ts";
import { cpuBusy, cpuCounters, memoryAvailable } from "../../integrations/host-health/probes.ts";



const sample = (cursor: Cursor, gib: number, at = 1) => observe(presets["disk-root"], cursor, gib, at);
const acknowledged = ({ pending: _, ...cursor }: Cursor): Cursor => cursor;

it("debounces low space, escalates immediately, and rearms only after sustained recovery", () => {
	let cursor = sample(initial(), 14);
	cursor = sample(cursor, 15);
	cursor = sample(cursor, 14);
	assert.equal(cursor.pending, undefined);
	cursor = sample(cursor, 14, 4);
	assert.deepEqual(cursor.pending, { at: 4, value: 14, severity: "warning" });
	cursor = sample(acknowledged(cursor), 4, 5);
	assert.equal(cursor.pending?.severity, "critical");
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
	const policy = presets.cpu;
	let cursor = initial();
	for (let i = 0; i < 4; i++) cursor = observe(policy, cursor, 91, i);
	assert.equal(cursor.pending, undefined);
	assert.equal(observe(policy, cursor, undefined, 4).streak, 0);
	cursor = observe(policy, cursor, 91, 4);
	assert.equal(cursor.pending?.severity, "warning");
	cursor = acknowledged(cursor);
	assert.equal(observe(policy, cursor, 100, 5).pending, undefined);
	assert.equal(observe(policy, observe(policy, cursor, 74, 6), 74, 7).level, "normal");
});

it("memory warns after three low readings and escalates immediately", () => {
	const policy = presets.memory;
	const twice = observe(policy, observe(policy, initial(), 9, 1), 9, 2);
	assert.equal(twice.pending, undefined);
	const warning = observe(policy, twice, 9, 3);
	assert.equal(warning.pending?.severity, "warning");
	assert.equal(observe(policy, acknowledged(warning), 2.5, 4).pending?.severity, "critical");
});

it("uses CPU counter deltas without double-counting guests and uses MemAvailable", () => {
	const before = cpuCounters("cpu 100 0 50 300 10 0 0 0 10 0");
	const after = cpuCounters("cpu 160 0 70 315 15 0 0 0 40 0");
	assert.equal(cpuBusy(before, after), 80);
	assert.equal(cpuBusy(undefined, after), undefined);
	assert.equal(cpuBusy(after, before), undefined);
	assert.equal(memoryAvailable(["MemTotal: 10000 kB", "MemFree: 100 kB", "MemAvailable: 1700 kB"].join(String.fromCharCode(10))), 17);
	assert.throws(() => memoryAvailable("MemTotal: 10000 kB"), /Invalid memory/);
});

it("supports fractional thresholds and inclusive ranges with independent rearm", () => {
	const memory = policyFor({ check: "memory", rule: {
		trigger: { op: "below", value: 33.333 },
		rearm: { op: "above", value: 40 },
	} });
	assert.equal(observe(memory, initial(), 33.333, 1).pending, undefined);
	assert.equal(observe(memory, initial(), 33.3329, 2).pending?.severity, "warning");
	const disk = policyFor({ check: "disk-root", rule: {
		trigger: { op: "between", min: 10, max: 15 },
		rearm: { op: "above", value: 17 },
		rearmSamples: 1,
	} });
	const hit = observe(disk, initial(), 15, 1);
	assert.equal(hit.pending?.severity, "warning");
	assert.equal(observe(disk, acknowledged(hit), 18, 2).level, "normal");
	assert.equal(observe(disk, initial(), 4, 3).pending, undefined);
});

it("rejects overlapping, reversed, and out-of-range rules", () => {
	const trigger = { op: "between", min: 10, max: 15 } as const;
	assert.throws(() => policyFor({ check: "cpu", rule: { trigger, rearm: { op: "above", value: 12 } } }), /overlap/);
	assert.throws(() => policyFor({ check: "cpu", rule: { trigger: { ...trigger, min: 16 }, rearm: { op: "above", value: 17 } } }), /minimum/);
	assert.throws(() => policyFor({ check: "memory", rule: { trigger, rearm: { op: "above", value: 101 } } }), /range/);
});
