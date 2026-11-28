// Persisted schemas from 1b31cdca. Version 3 runs had the same fields except backend.
import { arr, bool, int, obj, opt, str, union } from "@earendil-works/pi-schema";
import { literal } from "@p2/app/v1";

const REPO_PATTERN = "^(?!\\.{1,2}/)[A-Za-z0-9._-]+/(?!\\.{1,2}$)[A-Za-z0-9._-]+$";
const RuntimeSchema = union([literal("local"), literal("cloud")]);
const ModeSchema = union([literal("ask"), literal("plan"), literal("agent")]);
const StatusSchema = union([
	literal("running"),
	literal("finished"),
	literal("failed"),
	literal("cancelled"),
	literal("timed-out"),
	literal("interrupted"),
]);
const SandboxModeSchema = union([literal("when-possible"), literal("required"), literal("off")]);
const AcpBackendSchema = literal("acp");
const RunSandboxSchema = union([literal("on"), literal("off"), literal("unavailable")]);
const Repo = str({ pattern: REPO_PATTERN, maxLength: 200 });
const UsageSchema = obj({
	inputTokens: int({ minimum: 0 }),
	outputTokens: int({ minimum: 0 }),
	totalTokens: int({ minimum: 0 }),
	chargedCents: opt(int({ minimum: 0 })),
});
const GitSchema = obj({ branch: opt(str({ maxLength: 300 })), prUrl: opt(str({ maxLength: 500 })) });
const RUN_VIEW = {
	id: str(),
	runtime: RuntimeSchema,
	backend: opt(AcpBackendSchema),
	mode: ModeSchema,
	status: StatusSchema,
	model: opt(str({ maxLength: 200 })),
	repo: opt(Repo),
	branch: opt(str({ maxLength: 300 })),
	cwd: opt(str({ maxLength: 1024 })),
	prompt: str({ maxLength: 200 }),
	createdAt: int(),
	finishedAt: opt(int()),
	durationMs: opt(int({ minimum: 0 })),
	error: opt(str({ maxLength: 500 })),
	usage: opt(UsageSchema),
	git: opt(GitSchema),
	resultChars: opt(int({ minimum: 0 })),
	sandbox: opt(RunSandboxSchema),
	heartbeatAt: opt(int()),
	activity: opt(str({ maxLength: 200 })),
	files: opt(arr(str({ maxLength: 300 }), { maxItems: 20 })),
	interruption: opt(str({ maxLength: 500 })),
	interruptedAt: opt(int()),
	attempt: opt(int({ minimum: 1 })),
	autoResumes: opt(int({ minimum: 0 })),
};
export const ConfigSchema = obj({
	keyStored: bool(),
	model: str({ maxLength: 200 }),
	runtime: RuntimeSchema,
	repos: arr(str({ maxLength: 200 }), { maxItems: 256 }),
	allowLocalEdits: bool(),
	allowCloudEdits: bool(),
	sandbox: opt(SandboxModeSchema),
	autoResume: opt(bool()),
	maxRuns: opt(int({ minimum: 1, maximum: 12 })),
	maxPerSession: opt(int({ minimum: 1, maximum: 12 })),
});
export const RunRecordSchema = obj({
	...RUN_VIEW,
	session: str(),
	conversation: int(),
	agentId: opt(str()),
	cursorRunId: opt(str()),
	deadline: int(),
	text: str({ maxLength: 16_000 }),
	notified: union([literal("no"), literal("yes"), literal("gave-up")]),
});
