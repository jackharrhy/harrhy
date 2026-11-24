// What the server keeps: the owner's settings and the runs (both in p2 state, no config files; the key is in secrets.ts).
import { arr, bool, int, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import { defineState, literal, local, method } from "@p2/app/v1";
import { RUN_VIEW, RuntimeSchema, SandboxModeSchema, SandboxStatusSchema, SurvivalSchema } from "./contract.ts";
import { LIMITS, RUN_CAPS } from "./limits.ts";

export const MAX_REPOS = 256;

/**
 * The owner's settings. Version 2 added `sandbox` (migrated to `when-possible`). Changing a stored schema needs
 * version+1 and a `migrate`, or the object fails to load where the old one is stored (__tests__/p2/cursor-upgrade.test.ts).
 */
const ConfigSchema = obj({
	/** A key is in cursor-secrets.json (the file is the truth; this mirrors it for the Settings page). */
	keyStored: bool(),
	model: str({ maxLength: 200 }),
	runtime: RuntimeSchema,
	repos: arr(str({ maxLength: 200 }), { maxItems: MAX_REPOS }),
	allowLocalEdits: bool(),
	allowCloudEdits: bool(),
	/** Added after version 1 shipped: absent in settings stored before, which reads as `when-possible`. */
	sandbox: opt(SandboxModeSchema),
	/** Added in version 3: resume interrupted runs by itself, at most twice each. Absent reads as off. */
	autoResume: opt(bool()),
	/** Added in version 4: runs at once, all sessions and per session (absent reads as 6 and 4). */
	maxRuns: opt(int({ minimum: 1, maximum: RUN_CAPS.ceiling })),
	maxPerSession: opt(int({ minimum: 1, maximum: RUN_CAPS.ceiling })),
});
export type Config = Static<typeof ConfigSchema>;
export const ConfigState = defineState("p2.cursor-config", {
	version: 4,
	// Version 1 had no `sandbox` (it gains the default), version 2 no `autoResume` (off), version 3 no run caps (6 and 4).
	migrate: (old) => {
		const config = old as Config;
		return {
			...config,
			sandbox: config.sandbox ?? "when-possible",
			autoResume: config.autoResume ?? false,
			maxRuns: config.maxRuns ?? RUN_CAPS.total,
			maxPerSession: config.maxPerSession ?? RUN_CAPS.perSession,
		};
	},
	schema: ConfigSchema,
	initial: (): Config => ({
		keyStored: false,
		model: "",
		runtime: "local",
		repos: [],
		allowLocalEdits: false,
		allowCloudEdits: false,
	}),
	persist: true,
	checkpointWhen: () => true,
});

/** What Pi found out about sandboxing on this machine: kept for this process only, so a new machine or OS asks again. */
export const SandboxState = defineState("p2.cursor-sandbox", {
	version: 1,
	schema: SandboxStatusSchema,
	initial: () => ({ status: "unknown" as const, detail: "" }),
});

/** Whether detached workers outlived the last Pi restart: kept, because the evidence comes at the restart after it. */
export const SurvivalState = defineState("p2.cursor-survival", {
	version: 1,
	schema: SurvivalSchema,
	initial: () => ({ status: "unknown" as const, detail: "" }),
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
	// Version 3: runs may be `lost` and carry a heartbeat, last activity and files (all optional).
	version: 3,
	migrate: (old) => old as { runs: RunRecord[] },
	schema: obj({ runs: arr(RunRecordSchema, { maxItems: LIMITS.kept + 16 }) }),
	initial: () => ({ runs: [] as RunRecord[] }),
	persist: true,
	checkpointWhen: () => true,
});

const ConfigPatch = obj({
	keyStored: opt(bool()),
	model: opt(str({ maxLength: 200 })),
	runtime: opt(RuntimeSchema),
	allowLocalEdits: opt(bool()),
	allowCloudEdits: opt(bool()),
	sandbox: opt(SandboxModeSchema),
	autoResume: opt(bool()),
	maxRuns: opt(int({ minimum: 1, maximum: RUN_CAPS.ceiling })),
	maxPerSession: opt(int({ minimum: 1, maximum: RUN_CAPS.ceiling })),
	allowRepo: opt(str({ maxLength: 200 })),
	removeRepo: opt(str({ maxLength: 200 })),
});

/** The server-local store behind both remotes. */
export const CursorStore = local("p2.cursor-store", {
	version: 4,
	params: {},
	members: {
		config: ConfigSchema,
		runs: arr(RunRecordSchema),
		sandboxStatus: SandboxStatusSchema,
		setSandboxStatus: method(SandboxStatusSchema),
		survival: SurvivalSchema,
		setSurvival: method(SurvivalSchema),
		patchConfig: method(ConfigPatch),
		put: method(RunRecordSchema),
		remove: method(obj({ id: str() })),
	},
});
