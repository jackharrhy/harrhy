// Deterministic cron boundaries, Newfoundland half-hour offsets and missed-run selection.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dueOccurrence, nextOccurrence } from "../../plugins/schedules/recurrence.ts";

const morning = { cron: "0 8 * * *", timezone: "America/St_Johns" };
const iso = (at: number) => new Date(at).toISOString();

describe("recurring occurrence calculation", () => {
	it("keeps 08:00 Newfoundland across both DST changes", () => {
		assert.equal(iso(nextOccurrence(morning, Date.parse("2026-03-07T12:00:00Z"))), "2026-03-08T10:30:00.000Z");
		assert.equal(iso(nextOccurrence(morning, Date.parse("2026-10-31T12:00:00Z"))), "2026-11-01T11:30:00.000Z");
		assert.equal(iso(nextOccurrence(morning, Date.parse("2026-11-15T06:00:00Z"))), "2026-11-15T11:30:00.000Z");
	});
	it("uses pinned parser semantics for Newfoundland gaps and a restart between repeated hours", () => {
		const gap = { cron: "30 2 * * *", timezone: morning.timezone };
		assert.equal(iso(nextOccurrence(gap, Date.parse("2026-03-08T00:00:00Z"))), "2026-03-08T06:00:00.000Z");
		const fold = { cron: "30 1 * * *", timezone: morning.timezone };
		assert.equal(iso(nextOccurrence(fold, Date.parse("2026-11-01T00:00:00Z"))), "2026-11-01T04:00:00.000Z");
		assert.equal(iso(nextOccurrence(fold, Date.parse("2026-11-01T04:00:00Z"))), "2026-11-02T05:00:00.000Z");
		assert.equal(iso(nextOccurrence(fold, Date.parse("2026-11-01T04:45:00Z"))), "2026-11-01T05:00:00.000Z");
	});
	it("uses strictly future boundaries and one latest missed occurrence", () => {
		const at = Date.parse("2026-11-15T11:30:00Z");
		assert.equal(iso(nextOccurrence(morning, at)), "2026-11-16T11:30:00.000Z");
		assert.equal(dueOccurrence(morning, at, at - 1), undefined);
		assert.equal(dueOccurrence(morning, at, at), at);
		assert.equal(iso(dueOccurrence(morning, at, Date.parse("2026-12-15T12:00:00Z"))!), "2026-12-15T11:30:00.000Z");
	});
	it("supports steps, weekday ranges and optional seconds without random schedules", () => {
		assert.equal(
			iso(nextOccurrence({ cron: "*/10 * * * * *", timezone: "UTC" }, Date.parse("2026-11-15T01:00:01Z"))),
			"2026-11-15T01:00:10.000Z",
		);
		assert.equal(
			iso(nextOccurrence({ cron: "0 8 * * MON-FRI", timezone: "UTC" }, Date.parse("2026-11-13T09:00:00Z"))),
			"2026-11-16T08:00:00.000Z",
		);
		assert.throws(() => nextOccurrence({ cron: "H * * * *", timezone: "UTC" }, 0));
		assert.throws(() => nextOccurrence({ cron: "0 8 * * *", timezone: "Mars/Base" }, 0));
		assert.throws(() => nextOccurrence({ cron: "0 99 * * *", timezone: "UTC" }, 0));
	});
});
