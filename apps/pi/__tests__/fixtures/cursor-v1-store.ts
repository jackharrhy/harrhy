// What the first release of the cursor integration (commit 3c577d5d) stored: its two states and its local store, with
// their schemas and versions as they were. The upgrade test writes these objects into a data directory, then starts the
// current plugin on it. Do not edit: it is the record of what version 1 wrote.
import { arr, bool, int, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import { defineFacet, defineState, literal, local, method } from "@p2/app/v1";

const Runtime = union([literal("local"), literal("cloud")]);
const Mode = union([literal("ask"), literal("plan"), literal("agent")]);
const Status = union([literal("running"), literal("finished"), literal("failed"), literal("cancelled"), literal("timed-out")]);
const Usage = obj({
	inputTokens: int({ minimum: 0 }),
	outputTokens: int({ minimum: 0 }),
	totalTokens: int({ minimum: 0 }),
	chargedCents: opt(int({ minimum: 0 })),
});
const Git = obj({ branch: opt(str({ maxLength: 300 })), prUrl: opt(str({ maxLength: 500 })) });

const ConfigV1 = obj({
	keyStored: bool(),
	model: str({ maxLength: 200 }),
	runtime: Runtime,
	repos: arr(str({ maxLength: 200 }), { maxItems: 256 }),
	allowLocalEdits: bool(),
	allowCloudEdits: bool(),
});
const RunRecordV1 = obj({
	id: str(),
	runtime: Runtime,
	mode: Mode,
	status: Status,
	model: opt(str({ maxLength: 200 })),
	repo: opt(str({ maxLength: 200 })),
	branch: opt(str({ maxLength: 300 })),
	cwd: opt(str({ maxLength: 1024 })),
	prompt: str({ maxLength: 200 }),
	createdAt: int(),
	finishedAt: opt(int()),
	durationMs: opt(int({ minimum: 0 })),
	error: opt(str({ maxLength: 500 })),
	usage: opt(Usage),
	git: opt(Git),
	resultChars: opt(int({ minimum: 0 })),
	session: str(),
	conversation: int(),
	agentId: opt(str()),
	cursorRunId: opt(str()),
	deadline: int(),
	text: str({ maxLength: 16_000 }),
	notified: union([literal("no"), literal("yes"), literal("gave-up")]),
});
export type RunRecordV1 = Static<typeof RunRecordV1>;

const Config = defineState("p2.cursor-config", {
	version: 1,
	schema: ConfigV1,
	initial: () => ({ keyStored: false, model: "", runtime: "local" as const, repos: [] as string[], allowLocalEdits: false, allowCloudEdits: false }),
	persist: true,
	checkpointWhen: () => true,
});
const Runs = defineState("p2.cursor-runs", {
	version: 1,
	schema: obj({ runs: arr(RunRecordV1, { maxItems: 66 }) }),
	initial: () => ({ runs: [] as RunRecordV1[] }),
	persist: true,
	checkpointWhen: () => true,
});

/** The version 1 store, as 3c577d5d declared it. */
export const StoreV1 = local("p2.cursor-store", {
	version: 1,
	params: {},
	members: { seed: method(obj({ runs: arr(RunRecordV1) })) },
});

/** A facet that writes version 1's objects: settings with non-default values, and the given runs. */
export const writerV1 = defineFacet((host) => {
	host.serve(StoreV1, (_params, self) => {
		const config = self.state(Config);
		const runs = self.state(Runs);
		return {
			seed: async ({ runs: seeded }, ctx) => {
				await config.change((draft) => {
					draft.keyStored = true;
					draft.model = "composer-2";
					draft.runtime = "cloud";
					draft.repos = ["acme/*", "Other/Site"];
					draft.allowLocalEdits = true;
					draft.allowCloudEdits = false;
				}, ctx);
				await runs.change((draft) => {
					draft.runs = seeded;
				}, ctx);
				return null;
			},
		};
	});
});
