import { int, obj, opt, type Static, union } from "@earendil-works/pi-schema";
import { literal } from "@p2/app/v1";

const GiB = 1024 ** 3;
export const Metric = union([literal("disk-root"), literal("cpu"), literal("memory")]);
export type Metric = Static<typeof Metric>;

type Policy = {
	label: string;
	direction: "below" | "above";
	warning: number;
	critical?: number;
	recovery: number;
	warningSamples: number;
	format: (value: number) => string;
};
const percent = (value: number) => `${value / 100}%`;
export const policies: Record<Metric, Policy> = {
	"disk-root": {
		label: "Root disk space available (/)", direction: "below", warning: 15 * GiB,
		critical: 5 * GiB, recovery: 20 * GiB, warningSamples: 2,
		format: (bytes) => `${(bytes / GiB).toFixed(2)} GiB`,
	},
	cpu: {
		label: "Host CPU busy", direction: "above", warning: 9000,
		recovery: 7500, warningSamples: 5, format: percent,
	},
	memory: {
		label: "Host memory available", direction: "below", warning: 1000,
		critical: 300, recovery: 1500, warningSamples: 3, format: percent,
	},
};

export const Cursor = obj({
	level: union([literal("normal"), literal("warning"), literal("critical")]),
	streak: int({ minimum: 0 }),
	sequence: int(),
	pending: opt(obj({ at: int(), value: int(), threshold: int() })),
});
export type Cursor = Static<typeof Cursor>;
export const initial = (): Cursor => ({ level: "normal", streak: 0, sequence: 0 });

export function observe(policy: Policy, cursor: Cursor, value: number | undefined, at: number): Cursor {
	if (cursor.pending) return cursor;
	const reset = () => cursor.streak ? { ...cursor, streak: 0 } : cursor;
	if (value === undefined) return reset();
	const breached = (threshold: number) => policy.direction === "below" ? value < threshold : value > threshold;
	const recovered = policy.direction === "below" ? value > policy.recovery : value < policy.recovery;
	const alert = (level: "warning" | "critical", threshold: number): Cursor => ({
		level, streak: 0, sequence: cursor.sequence + 1, pending: { at, value, threshold },
	});
	if (cursor.level !== "critical" && policy.critical !== undefined && breached(policy.critical))
		return alert("critical", policy.critical);
	const streak = cursor.streak + 1;
	if (cursor.level === "normal" && breached(policy.warning))
		return streak >= policy.warningSamples ? alert("warning", policy.warning) : { ...cursor, streak };
	if (cursor.level !== "normal" && recovered)
		return streak >= 2 ? { ...cursor, level: "normal", streak: 0 } : { ...cursor, streak };
	return reset();
}
