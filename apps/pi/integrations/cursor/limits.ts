// Numbers and patterns shared by the server facets and the detached agent process. No imports: the agent process runs
// outside the plugin loader and can import only plain modules like this one.

/** Hard limits: what crosses to Cursor, what is kept and what the agent and the wake text get back. */
export const LIMITS = {
	prompt: 20_000,
	/** What Pi keeps of a run's final text, and the most `cursor_result` returns. */
	result: 16_000,
	/** What a wake says of the result. */
	summary: 1_500,
	/** Runs kept after they finish. (How many may go at once is the owner's setting: see RUN_CAPS.) */
	kept: 50,
	/** Wall time of a run, in minutes: default and most. */
	defaultMinutes: 30,
	maxMinutes: 120,
} as const;

/** The owner's caps on runs going at once: all sessions and one session. Each setting is 1 to `ceiling`; the code never goes past it. */
export const RUN_CAPS = { total: 6, perSession: 4, ceiling: 12 } as const;

/** A local worker writes its heartbeat this often; the observer calls it stale after three missed beats. */
export const HEARTBEAT_MS = 15_000;
export const STALE_BEATS = 3;

/** `owner/name` (GitHub), the only repository form a cloud run takes. */
export const REPO_PATTERN = "^(?!\\.{1,2}/)[A-Za-z0-9._-]+/(?!\\.{1,2}$)[A-Za-z0-9._-]+$";

/** A model id as typed: letters, digits and a few separators. */
export const MODEL_PATTERN = /^[\w.:/@+-]{1,200}$/;
