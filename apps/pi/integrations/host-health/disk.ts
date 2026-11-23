import { int, obj, opt, type Static } from "@earendil-works/pi-schema";
import { literal } from "@p2/app/v1";

export const GiB = 1024 ** 3;
export const LOW = 15 * GiB;
export const CRITICAL = 5 * GiB;
export const REARM = 20 * GiB;
export const Cursor = obj({
	level: int({ minimum: 0, maximum: 2 }),
	streak: int({ minimum: 0, maximum: 1 }),
	pending: opt(obj({ id: int(), at: int(), available: int(), threshold: int() })),
	sequence: int(),
});
export type Cursor = Static<typeof Cursor>;
export const initial = (): Cursor => ({ level: 0, streak: 0, sequence: 0 });

export function observe(cursor: Cursor, available: number, at: number): Cursor {
	if (cursor.pending) return cursor;
	const alert = (level: number, threshold: number): Cursor => ({
		level, streak: 0, sequence: cursor.sequence + 1,
		pending: { id: cursor.sequence + 1, at, available, threshold },
	});
	if (cursor.level < 2 && available < CRITICAL) return alert(2, CRITICAL);
	if (cursor.level === 0 && available < LOW)
		return cursor.streak ? alert(1, LOW) : { ...cursor, streak: 1 };
	if (cursor.level > 0 && available > REARM)
		return cursor.streak ? { ...cursor, level: 0, streak: 0 } : { ...cursor, streak: 1 };
	return cursor.streak ? { ...cursor, streak: 0 } : cursor;
}

export const Check = obj({ check: literal("disk-root") });
