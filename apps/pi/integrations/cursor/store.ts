// What the server keeps: the owner's settings and the runs (both in p2 state, no config files; the key is in secrets.ts).
import { arr, bool, int, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import { defineState, literal, local, method } from "@p2/app/v1";
import { RUN_VIEW } from "./contract.ts";
import { LIMITS, RUN_CAPS } from "./limits.ts";

export const MAX_REPOS = 256;

const ConfigSchema = obj({
	/** A key is in cursor-secrets.json (the file is the truth; this mirrors it for the Settings page). */
	keyStored: bool(),
	model: str({ maxLength: 200 }),
	repos: arr(str({ maxLength: 200 }), { maxItems: MAX_REPOS }),
	allowCloudEdits: bool(),
	maxRuns: opt(int({ minimum: 1, maximum: RUN_CAPS.ceiling })),
	maxPerSession: opt(int({ minimum: 1, maximum: RUN_CAPS.ceiling })),
});
export type Config = Static<typeof ConfigSchema>;
export const ConfigState = defineState("p2.cursor-config", {
	version: 5,
	migrate: (old) => {
		const config = old as Config;
		return {
			keyStored: config.keyStored,
			model: config.model,
			repos: config.repos,
			allowCloudEdits: config.allowCloudEdits,
			maxRuns: config.maxRuns ?? RUN_CAPS.total,
			maxPerSession: config.maxPerSession ?? RUN_CAPS.perSession,
		};
	},
	schema: ConfigSchema,
	initial: (): Config => ({
		keyStored: false,
		model: "",
		repos: [],
		allowCloudEdits: false,
	}),
	persist: true,
	checkpointWhen: () => true,
});

/** A run as kept: its view, whose it is, what Cursor called it and its final text. */
export const RunRecordSchema = obj({
	...RUN_VIEW,
	session: str(),
	conversation: int(),
	/** Cursor's agent and run ids (set once the run has started). */
	agentId: opt(str()),
	cursorRunId: opt(str()),
	/** When the run is given up on, in ms since the epoch. */
	deadline: int(),
	/** The final text, at most `LIMITS.result` characters. */
	text: str({ maxLength: LIMITS.result }),
	/** Whether the stimulus is out: `no` until published (or found published), `gave-up` when it could not be. */
	notified: union([literal("no"), literal("yes"), literal("gave-up")]),
});
export type RunRecord = Static<typeof RunRecordSchema>;
export const RunsState = defineState("p2.cursor-runs", {
	version: 5,
	migrate: (old) => {
		const { runs } = old as { runs: Record<string, unknown>[] };
		const cloud = runs.filter((run) => run.runtime === "cloud").map((run) => {
			// Keep only current fields. The SDK sent plan even when the old record said ask.
			const fields = Object.entries(run).filter(([key]) => Object.hasOwn(RunRecordSchema.properties!, key));
			return { ...Object.fromEntries(fields), mode: run.mode === "ask" ? "plan" : run.mode } as RunRecord;
		});
		return { runs: cloud };
	},
	schema: obj({ runs: arr(RunRecordSchema, { maxItems: LIMITS.kept + 16 }) }),
	initial: () => ({ runs: [] as RunRecord[] }),
	persist: true,
	checkpointWhen: () => true,
});

const ConfigPatch = obj({
	keyStored: opt(bool()),
	model: opt(str({ maxLength: 200 })),
	allowCloudEdits: opt(bool()),
	maxRuns: opt(int({ minimum: 1, maximum: RUN_CAPS.ceiling })),
	maxPerSession: opt(int({ minimum: 1, maximum: RUN_CAPS.ceiling })),
	allowRepo: opt(str({ maxLength: 200 })),
	removeRepo: opt(str({ maxLength: 200 })),
});

/** The server-local store behind both remotes. */
export const CursorStore = local("p2.cursor-store", {
	version: 6,
	params: {},
	members: {
		config: ConfigSchema,
		runs: arr(RunRecordSchema),
		patchConfig: method(ConfigPatch),
		put: method(RunRecordSchema),
		remove: method(obj({ id: str() })),
	},
});
