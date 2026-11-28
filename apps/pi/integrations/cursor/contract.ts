// What a `cursor.run` subscription and its events are, the agent's remote (start, look at and stop runs) and the owner's
// settings. Descriptions only: the rules are in policy.ts and runs.ts. Shared by the server, the worker and the web facet.
import { arr, bool, int, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import { literal, method, record, remote, serverHost } from "@p2/app/v1";
import { LIMITS, REPO_PATTERN, RUN_CAPS } from "./limits.ts";

export const SOURCE_ID = "cursor.run";
export const SOURCE_VERSION = 1;

export { LIMITS, REPO_PATTERN } from "./limits.ts";

export const ModeSchema = union([literal("plan"), literal("agent")]);
export const StatusSchema = union([
	literal("running"),
	literal("finished"),
	literal("failed"),
	literal("cancelled"),
	literal("timed-out"),
	literal("interrupted"),
]);
export type Status = Static<typeof StatusSchema>;

const Repo = str({ pattern: REPO_PATTERN, maxLength: 200 });

const UsageSchema = obj({
	inputTokens: int({ minimum: 0 }),
	outputTokens: int({ minimum: 0 }),
	totalTokens: int({ minimum: 0 }),
	/** Billed cost in cents, when the SDK has reported it. */
	chargedCents: opt(int({ minimum: 0 })),
});
const GitSchema = obj({ branch: opt(str({ maxLength: 300 })), prUrl: opt(str({ maxLength: 500 })) });

/** A run as the agent and the owner see it: no prompt, no result text (`cursor_result` has that). */
export const RUN_VIEW = {
	id: str(),
	mode: ModeSchema,
	status: StatusSchema,
	model: opt(str({ maxLength: 200 })),
	repo: opt(Repo),
	branch: opt(str({ maxLength: 300 })),
	/** The first words of the prompt. */
	prompt: str({ maxLength: 200 }),
	createdAt: int(),
	finishedAt: opt(int()),
	durationMs: opt(int({ minimum: 0 })),
	error: opt(str({ maxLength: 500 })),
	usage: opt(UsageSchema),
	git: opt(GitSchema),
	/** How much final text is kept for `cursor_result`. */
	resultChars: opt(int({ minimum: 0 })),
	interruption: opt(str({ maxLength: 500 })),
	interruptedAt: opt(int()),
	attempt: opt(int({ minimum: 1 })),
};
export const RunViewSchema = obj(RUN_VIEW);
export type RunView = Static<typeof RunViewSchema>;

/** The config of a `cursor.run` subscription: which run it is about. */
export const WatchSchema = obj({ runId: str({ pattern: "^cursor-[0-9a-f]{24}$" }) });
export type Watch = Static<typeof WatchSchema>;

// Keep version 1 readable for previously published events.
export const EventSchema = obj({
	runId: str({ pattern: "^cursor-[0-9a-f]{24}$" }),
	runtime: union([literal("local"), literal("cloud")]),
	backend: opt(literal("acp")),
	mode: union([literal("ask"), literal("plan"), literal("agent")]),
	status: union([literal("finished"), literal("failed"), literal("cancelled"), literal("timed-out"), literal("interrupted")]),
	/** The start of the run's final text (at most `LIMITS.summary` characters), and whether there was more. */
	summary: str({ maxLength: LIMITS.summary }),
	truncated: bool(),
	sandbox: opt(union([literal("on"), literal("off"), literal("unavailable")])),
	/** Interrupted runs: what interrupted it and when, how it can go on, and the last thing the worker did. */
	interruption: opt(str({ maxLength: 500 })),
	interruptedAt: opt(int()),
	/** Pi already resumed it this many times by itself (the owner's setting). */
	autoResumed: opt(int({ minimum: 0 })),
	cwd: opt(str({ maxLength: 1024 })),
	activity: opt(str({ maxLength: 200 })),
	files: opt(arr(str({ maxLength: 300 }), { maxItems: 20 })),
	error: opt(str({ maxLength: 500 })),
	git: opt(GitSchema),
	durationMs: opt(int({ minimum: 0 })),
});
export type CursorEvent = Static<typeof EventSchema>;

const StartArgs = obj({
	/** Chosen by the tool from the call, so a replayed call is the same run. */
	runId: str({ pattern: "^cursor-[0-9a-f]{24}$" }),
	prompt: str({ minLength: 1, maxLength: LIMITS.prompt }),
	mode: opt(ModeSchema),
	model: opt(str({ minLength: 1, maxLength: 200 })),
	/** Parameters of the model (`{ effort: "high", thinking: "true" }`), as `cursor_models` lists them. */
	modelParams: opt(record(str({ maxLength: 50 }))),
	repo: str({ maxLength: 200 }),
	branch: opt(str({ minLength: 1, maxLength: 255 })),
	timeoutMinutes: opt(int({ minimum: 1, maximum: LIMITS.maxMinutes })),
	conversation: int(),
});
export type StartArgs = Static<typeof StartArgs>;

/** The server's side of the agent's tools. Every method is about the calling session's own runs. */
export const CursorRuns = remote("p2.cursor-runs", {
	version: 5,
	params: {},
	hostAddress: serverHost,
	variants: {
		worker: {
			methods: {
				start: method(StartArgs, RunViewSchema),
				status: method(obj({ id: str() }), RunViewSchema),
				result: method(
					obj({ id: str(), maxChars: opt(int({ minimum: 1, maximum: LIMITS.result })) }),
					obj({ run: RunViewSchema, text: str(), truncated: bool() }),
				),
				cancel: method(obj({ id: str() }), RunViewSchema),
				list: method(obj({}), arr(RunViewSchema)),
				/** Continues an interrupted run: the same Cursor agent, with a message saying what happened. */
				resume: method(obj({ id: str(), instruction: opt(str({ maxLength: 2000 })) }), RunViewSchema),
				/** The model ids the key may use, from the SDK's live list (kept ten minutes), with their parameters. */
				models: method(
					obj({}),
					obj({
						default: str(),
						models: arr(obj({ id: str(), name: str(), default: bool(), params: str() })),
						note: str(),
					}),
				),
			},
		},
	},
});

const ModelInfo = obj({ id: str({ maxLength: 200 }), name: str({ maxLength: 200 }) });

/** The owner's settings (Settings › Cursor). The API key goes in and never comes out. */
export const CursorSettings = remote("p2.cursor-settings", {
	version: 5,
	params: {},
	hostAddress: serverHost,
	variants: {
		owner: {
			state: {
				/** A key is stored (the key itself is never sent), and whether `CURSOR_API_KEY` is set as the fallback. */
				keyStored: bool(),
				keyFromEnv: bool(),
				model: str(),
				repos: arr(str()),
				allowCloudEdits: bool(),
				maxRuns: int(),
				maxPerSession: int(),
			},
			methods: {
				setKey: method(obj({ key: str({ minLength: 8, maxLength: 512 }) })),
				clearKey: method(obj({})),
				/** One harmless call (who the key is): says whether it works, never prints it. */
				testKey: method(obj({}), obj({ ok: bool(), message: str() })),
				/** The models the key may use, as the SDK reports them. */
				listModels: method(obj({}), obj({ ok: bool(), message: str(), models: arr(ModelInfo) })),
				setDefaults: method(obj({ model: str({ maxLength: 200 }) })),
				allow: method(obj({ repo: str({ maxLength: 200 }) })),
				remove: method(obj({ repo: str({ maxLength: 200 }) })),
				setAllowCloudEdits: method(obj({ allow: bool() })),
				/** Runs at once, all sessions and per session: 1 to 12 each, and a session cannot have more than the total. */
				setLimits: method(obj({ maxRuns: int({ minimum: 1, maximum: RUN_CAPS.ceiling }), maxPerSession: int({ minimum: 1, maximum: RUN_CAPS.ceiling }) })),
			},
		},
	},
});
