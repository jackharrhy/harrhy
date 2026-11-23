import { int, num, obj, opt, type Static, union } from "@earendil-works/pi-schema";
import { literal } from "@p2/app/v1";
import type { Condition, Metric, Watch } from "./contract.ts";

const above = (value: number): Condition => ({ op: "above", value });
const below = (value: number): Condition => ({ op: "below", value });

type Policy = {
	trigger: Condition;
	critical?: Condition;
	rearm: Condition;
	samples: number;
	rearmSamples: number;
};
export const presets: Record<Metric, Policy> = {
	"disk-root": { trigger: below(15), critical: below(5), rearm: above(20), samples: 2, rearmSamples: 2 },
	cpu: { trigger: above(90), rearm: below(75), samples: 5, rearmSamples: 2 },
	memory: { trigger: below(10), critical: below(3), rearm: above(15), samples: 3, rearmSamples: 2 },
};

export function matches(rule: Condition, value: number): boolean {
	switch (rule.op) {
		case "above": return value > rule.value;
		case "below": return value < rule.value;
		case "between": return value >= rule.min && value <= rule.max;
	}
}

export function policyFor({ check, rule }: Watch): Policy {
	if (!rule) return presets[check];
	const bounds = (condition: Condition): [number, number] => {
		const limit = check === "disk-root" ? Number.MAX_SAFE_INTEGER : 100;
		const points = condition.op === "between" ? [condition.min, condition.max] : [condition.value];
		if (points.some((value) => !Number.isFinite(value) || value < 0 || value > limit))
			throw new Error("Host health threshold is outside the metric range");
		if (condition.op === "between") {
			if (condition.min > condition.max) throw new Error("Host health range minimum exceeds maximum");
			return [condition.min, condition.max];
		}
		if ((condition.op === "above" && condition.value === limit) || (condition.op === "below" && condition.value === 0))
			throw new Error("Host health condition cannot match");
		return condition.op === "above" ? [condition.value, limit] : [0, condition.value];
	};
	const [triggerMin, triggerMax] = bounds(rule.trigger);
	const [rearmMin, rearmMax] = bounds(rule.rearm);
	const start = Math.max(triggerMin, rearmMin);
	const end = Math.min(triggerMax, rearmMax);
	if (start < end || (start === end && matches(rule.trigger, start) && matches(rule.rearm, start)))
		throw new Error("Host health trigger and rearm conditions overlap");
	return { trigger: rule.trigger, rearm: rule.rearm, samples: rule.samples ?? 1, rearmSamples: rule.rearmSamples ?? 2 };
}

export const Severity = union([literal("warning"), literal("critical")]);
export const Cursor = obj({
	level: union([literal("normal"), Severity]),
	streak: int({ minimum: 0 }),
	sequence: int(),
	pending: opt(obj({ at: int(), value: num(), severity: Severity })),
});
export type Cursor = Static<typeof Cursor>;
export const initial = (): Cursor => ({ level: "normal", streak: 0, sequence: 0 });

export function observe(policy: Policy, cursor: Cursor, value: number | undefined, at: number): Cursor {
	if (cursor.pending) return cursor;
	const reset = () => cursor.streak ? { ...cursor, streak: 0 } : cursor;
	if (value === undefined) return reset();
	const alert = (severity: Static<typeof Severity>): Cursor => ({
		level: severity, streak: 0, sequence: cursor.sequence + 1, pending: { at, value, severity },
	});
	if (cursor.level !== "critical" && policy.critical && matches(policy.critical, value))
		return alert("critical");
	const streak = cursor.streak + 1;
	if (cursor.level === "normal" && matches(policy.trigger, value))
		return streak >= policy.samples ? alert("warning") : { ...cursor, streak };
	if (cursor.level !== "normal" && matches(policy.rearm, value))
		return streak >= policy.rearmSamples ? { ...cursor, level: "normal", streak: 0 } : { ...cursor, streak };
	return reset();
}
