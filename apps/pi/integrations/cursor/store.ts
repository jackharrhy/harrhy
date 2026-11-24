// What the server keeps: the owner's settings and the runs (both in p2 state, no config files; the key is in secrets.ts).
import { arr, bool, int, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import { defineState, literal, local, method } from "@p2/app/v1";
import { LIMITS, RUN_VIEW, RuntimeSchema, SandboxModeSchema, SandboxStatusSchema } from "./contract.ts";

export const MAX_REPOS = 256;

/**
 * The owner's settings. Version 2 added `sandbox` (optional, so version 1's stored object is already valid). Changing the
 * schema without a version bump makes the object fail to load where the old one is stored.
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
});
export type Config = Static<typeof ConfigSchema>;
export const ConfigState = defineState("p2.cursor-config", {
	version: 2,
	migrate: (old) => old as Config,
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
	version: 2,
	migrate: (old) => old as { runs: RunRecord[] },
	schema: obj({ runs: arr(RunRecordSchema, { maxItems: LIMITS.kept + LIMITS.active * 4 }) }),
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
	allowRepo: opt(str({ maxLength: 200 })),
	removeRepo: opt(str({ maxLength: 200 })),
});

/** The server-local store behind both remotes. */
export const CursorStore = local("p2.cursor-store", {
	version: 1,
	params: {},
	members: {
		config: ConfigSchema,
		runs: arr(RunRecordSchema),
		sandboxStatus: SandboxStatusSchema,
		setSandboxStatus: method(SandboxStatusSchema),
		patchConfig: method(ConfigPatch),
		put: method(RunRecordSchema),
		remove: method(obj({ id: str() })),
	},
});
