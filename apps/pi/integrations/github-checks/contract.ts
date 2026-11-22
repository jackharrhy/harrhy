// What a `github.checks` subscription and its events are, and the agent's way to probe a watch. Descriptions only: the
// rules are in checks.ts. Shared by the server (the source, the poller) and the worker (the agent's tools).
import { arr, int, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import { literal, method, remote, serverHost } from "@p2/app/v1";

export const SOURCE_ID = "github.checks";
export const SOURCE_VERSION = 1;

// A name or a segment of `.` or `..` would change the request's path, so neither is accepted.
const Repo = str({
	pattern: "^(?!\\.{1,2}/)[A-Za-z0-9._-]+/(?!\\.{1,2}$)[A-Za-z0-9._-]+$",
	maxLength: 200,
});

/** What a subscription watches: a pull request's head, a branch's tip, or one commit. */
const RefSchema = union([
	obj({ kind: literal("pr"), number: int({ minimum: 1 }) }),
	obj({ kind: literal("branch"), name: str({ pattern: "^(?!\\.{1,2}$)[^\\p{C}]+$", maxLength: 255 }) }),
	obj({ kind: literal("commit"), sha: str({ pattern: "^[0-9a-f]{7,40}$" }) }),
]);
export type WatchRef = Static<typeof RefSchema>;

export const WatchSchema = obj({
	repo: Repo,
	ref: RefSchema,
	/** `failure`: say nothing when everything passed. Default `all`. */
	notify: opt(union([literal("all"), literal("failure")])),
	/** Only these check names count (a job's name, a status context); default every check. */
	only: opt(arr(str({ minLength: 1, maxLength: 200 }), { maxItems: 32 })),
});
export type Watch = Static<typeof WatchSchema>;

const Check = obj({
	name: str({ maxLength: 200 }),
	conclusion: str({ maxLength: 40 }),
	url: opt(str({ maxLength: 300 })),
});

export const EventSchema = obj({
	repo: Repo,
	ref: RefSchema,
	sha: str({ pattern: "^[0-9a-f]{40}$" }),
	result: union([literal("passed"), literal("failed"), literal("cancelled"), literal("no-checks")]),
	/** How many checks there were; `checks` lists at most 50 of them, failures first. */
	total: int({ minimum: 0 }),
	checks: arr(Check, { maxItems: 50 }),
	url: str({ maxLength: 2048 }),
});
export type ChecksEvent = Static<typeof EventSchema>;

/** The server's answer to an agent that wants to watch something: it checks the allowlist and that GitHub knows it. */
export const GithubChecksProbe = remote("p2.github-checks", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		worker: { methods: { probe: method(obj({ repo: Repo, ref: RefSchema }), obj({ sha: str() })) } },
	},
});
