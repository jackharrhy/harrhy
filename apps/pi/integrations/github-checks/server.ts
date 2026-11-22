// GitHub checks as a stimulus source: Pi polls GitHub for the commits its subscriptions watch and, once a commit's checks
// have all finished, publishes one event (passed, failed, cancelled or no checks) that wakes the subscribed session.
// Stimuli own persistence, delivery and retry; this only decides when a commit is done and publishes it once.
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { arr, compile, int, obj, opt, type Static, str } from "@earendil-works/pi-schema";
import { type Ctx, contribute, defineFacet, forbidden, isWorker, type Ref, signalOf, sleep } from "@p2/app/v1";
import { optionalText, processLogs } from "@p2/app/v1/node";
import {
	bindStimulusPublisher,
	Server,
	StimulusSources,
	type SubscriptionSchema,
	sourceKey,
	WakeStore,
} from "@p2/app/v1/server";
import { decide, eventChecks, instanceOf, type Item, itemsOf, refLabel, repoAllowed } from "./checks.ts";
import { GithubChecks } from "./contract.server.ts";
import { GithubChecksProbe, SOURCE_ID, SOURCE_VERSION, WatchSchema } from "./contract.ts";
import { GithubError, type GithubClient, githubClient } from "./github.ts";

const ConfigSchema = obj({
	/** A GitHub token with read access to the watched repositories. Without one, `gh auth token` supplies it. */
	token: opt(str({ minLength: 20 })),
	/** The `gh` command whose `auth token` supplies the token when `token` is absent (default `gh`). */
	ghPath: opt(str({ minLength: 1, maxLength: 1024 })),
	/** The repositories Pi may watch: `owner/name` or `owner/*`. A subscription for any other is not watched. */
	repos: arr(str({ minLength: 1, maxLength: 200 }), { minItems: 1, maxItems: 64 }),
	apiBase: opt(str({ minLength: 1, maxLength: 2048 })),
	/** How often to look while checks run or have not started (ms; default 15000). */
	pollMs: opt(int({ minimum: 20, maximum: 300_000 })),
	/** How often to look at a finished branch or open pull request that may get a new commit (ms; default 60000). */
	idleMs: opt(int({ minimum: 20, maximum: 3_600_000 })),
	/** How long everything must stay finished before it is reported, in case another workflow starts (ms; default 20000). */
	settleMs: opt(int({ minimum: 0, maximum: 300_000 })),
	/** How long to wait for a new commit's first check to appear before saying that none ran (ms; default 60000). */
	graceMs: opt(int({ minimum: 0, maximum: 3_600_000 })),
});
const configCheck = compile(ConfigSchema);
const watchCheck = compile(WatchSchema);
type Subscription = Static<typeof SubscriptionSchema>;
type Settings = {
	token: string | undefined;
	ghPath: string;
	repos: readonly string[];
	apiBase: string;
	pollMs: number;
	idleMs: number;
	settleMs: number;
	graceMs: number;
};

const TOKEN_TTL_MS = 3_600_000;
const RETRY_MAX_MS = 300_000;
const run = promisify(execFile);

/** The adapter's private configuration, read afresh; throws why when it is absent or invalid. */
async function readSettings(ctx: Ctx): Promise<Settings> {
	const server = await ctx.get(Server, {});
	const text = await optionalText(join(server.info.value.dataDir, "github-checks.json"));
	if (text === undefined) throw new Error("github-checks.json is not configured");
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error("github-checks.json is not valid JSON");
	}
	if (!configCheck.check(value)) throw new Error("github-checks.json is invalid");
	const apiBase = (value.apiBase ?? "https://api.github.com").replace(/\/+$/, "");
	try {
		const url = new URL(apiBase);
		const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
		if (url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && loopback)))
			throw new Error("bad");
	} catch {
		throw new Error("github-checks.json has an invalid apiBase (https, or http on loopback)");
	}
	if (value.token !== undefined) processLogs.redactor.addSecret(value.token);
	return {
		token: value.token,
		ghPath: value.ghPath ?? "gh",
		repos: value.repos,
		apiBase,
		pollMs: value.pollMs ?? 15_000,
		idleMs: value.idleMs ?? 60_000,
		settleMs: value.settleMs ?? 20_000,
		graceMs: value.graceMs ?? 60_000,
	};
}

/** The settings and a client for them; the token comes from the config or, kept for an hour, from `gh auth token`. */
function createAccess() {
	let fetched: { value: string; at: number } | undefined;
	let client: { key: string; github: GithubClient } | undefined;
	const ghToken = async (command: string): Promise<string> => {
		if (fetched !== undefined && Date.now() - fetched.at < TOKEN_TTL_MS) return fetched.value;
		let output: string;
		try {
			output = (await run(command, ["auth", "token"], { timeout: 10_000, maxBuffer: 8192 })).stdout.trim();
		} catch {
			throw new Error("No GitHub token: set `token` in github-checks.json, or sign in with `gh auth login`");
		}
		if (!/^[A-Za-z0-9_-]{20,}$/.test(output)) throw new Error("`gh auth token` did not return a token");
		processLogs.redactor.addSecret(output);
		fetched = { value: output, at: Date.now() };
		return output;
	};
	return {
		/** The next read asks `gh` again (GitHub refused the token). */
		forgetToken() {
			fetched = undefined;
		},
		async get(ctx: Ctx): Promise<{ settings: Settings; github: GithubClient }> {
			const settings = await readSettings(ctx);
			const token = settings.token ?? (await ghToken(settings.ghPath));
			const key = `${settings.apiBase}\n${token}`;
			if (client?.key !== key) client = { key, github: githubClient({ token, apiBase: settings.apiBase }) };
			return { settings, github: client.github };
		},
	};
}
type Access = ReturnType<typeof createAccess>;

/** A subscription that will not become watchable by asking again. */
class Permanent extends Error {}

/** What the poller remembers of one subscription (lost on restart: a published event is found again by its ID). */
type State = {
	revision: number;
	sha?: string;
	firstSeen: number;
	/** The finished checks last seen, and since when: they must stay the same for `settleMs`. */
	instance?: string;
	doneAt?: number;
	lastEventId?: string;
	/** No more looking until the subscription changes: a commit or closed pull request that reported, or a bad watch. */
	finished: boolean;
	nextAt: number;
	failures: number;
	lastError?: string;
};

export default defineFacet((host) => {
	const access = createAccess();
	host.serve(GithubChecksProbe, (_params, principal) => {
		if (!isWorker(principal)) throw forbidden("GitHub checks probes are for session workers");
		return {
			variant: "worker",
			members: {
				probe: async ({ repo, ref }, ctx) => {
					const { settings, github } = await access.get(ctx);
					if (!repoAllowed(repo, settings.repos)) throw new Error(`${repo} is not a repository Pi may watch`);
					const head = await github.head(repo, ref);
					if (!/^[0-9a-f]{40}$/.test(head.sha)) throw new Error(`GitHub knows no commit for ${refLabel(ref)}`);
					return { sha: head.sha };
				},
			},
		};
	});
	contribute(host, "p2.github-checks-poller", (self) => {
		self.contribute(StimulusSources, { [sourceKey(GithubChecks)]: GithubChecks });
		self.onLive(async (ctx) => {
			const signal = signalOf(ctx);
			const states = new Map<string, State>();
			let problem: string | undefined;
			while (!signal.aborted) {
				let wait: number;
				try {
					wait = await pass(ctx, access, states);
					problem = undefined;
				} catch (error) {
					if (signal.aborted) break;
					const message = error instanceof Error ? error.message : String(error);
					// Not configured is normal when the plugin is installed first; say each problem once.
					if (message !== problem) console.error(`p2 github-checks: ${message}`);
					problem = message;
					wait = 10_000;
				}
				if (!signal.aborted) await sleep(Math.max(20, wait), ctx).catch(() => {});
			}
		});
	});
});

/** One look at every watched subscription that is due; returns how long to wait until the next one is. */
async function pass(ctx: Ctx, access: Access, states: Map<string, State>): Promise<number> {
	const { settings, github } = await access.get(ctx);
	const store = await ctx.get(WakeStore, {});
	const subscriptions = (await store.subscriptions({}, ctx)).filter(
		(row) => row.enabled && row.source.id === SOURCE_ID && row.source.version === SOURCE_VERSION,
	);
	const live = new Set(subscriptions.map((row) => row.id));
	for (const id of states.keys()) if (!live.has(id)) states.delete(id);
	const signal = signalOf(ctx);
	for (const row of subscriptions) {
		if (signal.aborted) break;
		let state = states.get(row.id);
		if (state === undefined || state.revision !== row.revision) {
			state = { revision: row.revision, firstSeen: Date.now(), finished: false, nextAt: 0, failures: 0 };
			states.set(row.id, state);
		}
		if (state.finished || Date.now() < state.nextAt) continue;
		try {
			await check(ctx, settings, github, store, row, state);
			state.failures = 0;
			delete state.lastError;
		} catch (error) {
			if (signal.aborted) break;
			const message = error instanceof Error ? error.message : String(error);
			if (error instanceof GithubError && error.status === 401) access.forgetToken();
			// A pull request or branch GitHub does not know, or a repository not allowed, will not get better by asking.
			if (error instanceof Permanent || (error instanceof GithubError && error.permanent)) state.finished = true;
			state.failures++;
			state.nextAt = Math.max(
				Date.now() + Math.min(settings.pollMs * 2 ** state.failures, RETRY_MAX_MS),
				github.pausedUntil(),
			);
			if (message !== state.lastError)
				console.error(`p2 github-checks: ${row.id}: ${message}${state.finished ? " (not watching any more)" : ""}`);
			state.lastError = message;
		}
	}
	const due = [...states.values()].filter((state) => !state.finished).map((state) => state.nextAt);
	// With nothing to do, look at the subscriptions again soon: a new watch should not wait for the last wait.
	return due.length === 0 ? 3_000 : Math.min(Math.max(0, Math.min(...due) - Date.now()), 5_000);
}

async function check(
	ctx: Ctx,
	settings: Settings,
	github: GithubClient,
	store: Ref<typeof WakeStore>,
	row: Subscription,
	state: State,
): Promise<void> {
	if (!watchCheck.check(row.config)) throw new Permanent("The subscription is not a valid watch");
	const watched = row.config;
	if (!repoAllowed(watched.repo, settings.repos)) throw new Permanent(`${watched.repo} is not an allowed repository`);
	const signal = signalOf(ctx);
	const now = Date.now();
	const head = await github.head(watched.repo, watched.ref, signal);
	if (!/^[0-9a-f]{40}$/.test(head.sha)) throw new Error(`GitHub returned no commit for ${refLabel(watched.ref)}`);
	if (state.sha !== head.sha) {
		state.sha = head.sha;
		state.firstSeen = now;
		delete state.instance;
		delete state.doneAt;
	}
	const [runs, statuses] = await Promise.all([
		github.runs(watched.repo, head.sha, signal),
		github.statuses(watched.repo, head.sha, signal),
	]);
	const all = itemsOf(runs, statuses);
	const only = watched.only ?? [];
	const items: Item[] = only.length === 0 ? all : all.filter((item) => only.includes(item.name));
	let verdict = decide(items);
	// A named check can appear after the others (a job behind `needs:`): wait for it while anything else still runs
	// or the commit is new.
	const missing = only.some((name) => !items.some((item) => item.name === name));
	if (missing && (all.some((item) => !item.done) || now - state.firstSeen < settings.graceMs)) verdict = "pending";
	if (verdict === "pending") {
		delete state.instance;
		delete state.doneAt;
		state.nextAt = now + settings.pollMs;
		return;
	}
	if (verdict === "none" && now - state.firstSeen < settings.graceMs) {
		// A commit's checks can appear a little after it does: wait before saying that none ran.
		state.nextAt = now + settings.pollMs;
		return;
	}
	const result = verdict === "none" ? "no-checks" : verdict;
	const instance = instanceOf(items);
	if (state.instance !== instance) {
		state.instance = instance;
		state.doneAt = now;
	}
	const waited = now - (state.doneAt ?? now);
	if (waited < settings.settleMs) {
		state.nextAt = now + Math.min(settings.pollMs, settings.settleMs - waited);
		return;
	}
	// One ID per commit, result and set of finished runs: a re-run is a new event, polling again or restarting is not.
	const eventId = `${head.sha}:${result}:${instance}`;
	if (state.lastEventId !== eventId) {
		// Say nothing of a green commit when the subscription only wants failures; the commit is still done.
		if (watched.notify !== "failure" || (result !== "passed" && result !== "no-checks")) {
			const publisher = bindStimulusPublisher(store, GithubChecks, row);
			if ((await publisher.receipt({ eventId }, ctx)).state === "missing")
				await publisher.publish(
					{
						eventId,
						event: {
							repo: watched.repo,
							ref: watched.ref,
							sha: head.sha,
							result,
							total: items.length,
							checks: eventChecks(items),
							url: head.url,
						},
					},
					ctx,
				);
		}
		state.lastEventId = eventId;
	}
	// A pinned commit and a closed pull request get no new commits; a branch or open pull request may.
	if (head.closed) state.finished = true;
	else state.nextAt = Date.now() + settings.idleMs;
}
