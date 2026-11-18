// Deterministic cron occurrence calculation in an explicit IANA timezone.
import { CronExpressionParser } from "cron-parser";

export type Recurrence = { readonly cron: string; readonly timezone: string };

/** Validates the schedule boundary and returns its first occurrence strictly after `after`. */
export function nextOccurrence(schedule: Recurrence, after: number): number {
	return expression(schedule, after).next().getTime();
}

/** Selects one latest missed occurrence, without iterating through an overdue backlog. */
export function dueOccurrence(schedule: Recurrence, nextAt: number, now: number): number | undefined {
	if (nextAt > now) return undefined;
	return Math.max(
		nextAt,
		expression(schedule, now + 1)
			.prev()
			.getTime(),
	);
}

function expression(schedule: Recurrence, currentDate: number) {
	// Cron text and timezone enter from schema-checked remote arguments, not trusted declarations.
	const fields = schedule.cron.trim().split(/\s+/);
	if ((fields.length !== 5 && fields.length !== 6) || /\bH\b|\?/i.test(schedule.cron))
		throw new Error("Use a deterministic five- or six-field cron expression (no H or ?)");
	new Intl.DateTimeFormat("en", { timeZone: schedule.timezone }).format(0);
	return CronExpressionParser.parse(schedule.cron, { tz: schedule.timezone, currentDate });
}
