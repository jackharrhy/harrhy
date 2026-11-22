// GitHub checks as a stimulus source: Pi polls GitHub for the commits its subscriptions watch and, once a commit's checks
// have all finished, publishes one event (passed, failed, cancelled or no checks) that wakes the subscribed session.
// Stimuli own persistence, delivery and retry; this only decides when a commit is done and publishes it once.
import { join } from "node:path";
import { arr, compile, int, obj, opt, type Static, str } from "@earendil-works/pi-schema";
import { type Ctx, contribute, defineFacet, type Ref, signalOf, sleep } from "@p2/app/v1";
import { optionalText, processLogs } from "@p2/app/v1/node";
import {
	bindStimulusPublisher,
	Server,
	StimulusSources,
	type SubscriptionSchema,
	sourceKey,
	WakeStore,
} from "@p2/app/v1/server";
import {
	decide,
	eventChecks,
	itemsOf,
	type Result,
	refLabel,
	repoAllowed,
	SOURCE_ID,
	SOURCE_VERSION,
	type WatchConfig,
	type WatchRef,
} from "./contract.ts";
import { GithubChecks } from "./contract.server.ts";
import { type GithubClient, githubClient } from "./github.ts";

const ConfigSchema = obj({
	/** A read-only token (a fine-grained one with Checks, Commit statuses, Pull requests and Metadata read access). */
	token: str({ minLength: 20 }),
	/** The repositories Pi may watch: `owner/name` or `owner/*`. A subscription for any other is ignored. */
	repos: arr(str({ minLength: 1, maxLength: 200 }), { minItems: 1, maxItems: 64 }),
	apiBase: opt(str({ minLength: 1, maxLength: 2048 })),
	/** How often to look while checks run or have not started (ms; default 15000). */
	pollMs: opt(int({ minimum: 20, maximum: 300_000 })),
	/** How often to look at a finished commit that may still get a new one (ms; default 60000). */
	idleMs: opt(int({ minimum: 20, maximum: 3_600_000 })),
	/** How long everything must stay finished before it is reported, in case another workflow starts (ms; default 20000). */
	settleMs: opt(int({ minimum: 0, maximum: 300_000 })),
	/** How long to wait for a new commit's first check to appear before reporting "no checks" (ms; default 60000). */
	graceMs: opt(int({ minimum: 0, maximum: 3_600_000 })),
});
const configCheck = compile(ConfigSchema);
type Config = Static<typeof ConfigSchema>;
type Subscription = Static<typeof SubscriptionSchema>;

const DEFAULTS = { pollMs: 15_000, idleMs: 60_000, settleMs: 20_000, graceMs: 60_000 } as const;
const RETRY_MAX_MS = 300_000;

/** What the poller remembers of one subscription (lost on restart: published events are found again by their ID). */
type State = {
	revision: number;
	sha?: string;
	firstSeen: number;
	/** When the current set of finished checks was first seen. */
	doneAt?: number;
	fingerprint?: string;
	published: Set<string>;
	/** No more looking until the subscription changes: a pinned commit or a closed pull request is done. */
	finished: boolean;
	nextAt: number;
	failures: number;
	lastError?: string;
};

/** Reads the adapter's private configuration afresh; undefined (with a reason once) when it is absent or invalid. */
async function readConfig(ctx: Ctx): Promise<{ config: Config } | { problem: string }> {
	const server = await ctx.get(Server, {});
	const text = await optionalText(join(server.info.value.dataDir, "github-checks.json"));
	if (text === undefined) return { problem: "github-checks.json is not configured" };
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return { problem: "github-checks.json is not valid JSON" };
	}
	if (!configCheck.check(value)) return { problem: "github-checks.json is invalid" };
	const base = value.apiBase ?? "https://api.github.com";
	try {
		const url = new URL(base);
		if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("bad");
	} catch {
		return { problem: "github-checks.json has an invalid apiBase" };
	}
	processLogs.redactor.addSecret(value.token);
	return { config: { ...value, apiBase: base.replace(/\/+$/, "") } };
}

export default defineFacet((host) => {
	contribute(host, "p2.github-checks", (self) => {
		self.contribute(StimulusSources, { [sourceKey(GithubChecks)]: GithubChecks });
		self.onLive(async (ctx) => {
			const signal = signalOf(ctx);
			const states = new Map<string, State>();
			let client: { key: string; github: GithubClient } | undefined;
			let problem: string | undefined;
			const complain = (message: string) => {
				if (message !== problem) console.error(`p2 github-checks: ${message}`);
				problem = message;
			};
			while (!signal.aborted) {
				let wait = 3_000;
				try {
					const read = await readConfig(ctx);
					if ("problem" in read) {
						// Not configured is normal when the plugin is installed first; say so once.
						complain(read.problem);
						wait = 10_000;
					} else {
						problem = undefined;
						const { config } = read;
						const key = `${config.apiBase}\n${config.token}`;
						if (client?.key !== key)
							client = {
								key,
								github: githubClient({ token: config.token, apiBase: config.apiBase as string }),
							};
						wait = await pass(ctx, config, client.github, states);
					}
				} catch (error) {
					if (signal.aborted) break;
					complain(error instanceof Error ? error.message : String(error));
					wait = 10_000;
				}
				if (!signal.aborted) await sleep(Math.max(20, wait), ctx).catch(() => {});
			}
		});
	});
});

/** One look at every watched subscription that is due; returns how long to wait until the next one is. */
async function pass(ctx: Ctx, config: Config, github: GithubClient, states: Map<string, State>): Promise<number> {
	const store = await ctx.get(WakeStore, {});
	const subscriptions = (await store.subscriptions({}, ctx)).filter(
		(row) => row.enabled && row.source.id === SOURCE_ID && row.source.version === SOURCE_VERSION,
	);
	const live = new Set(subscriptions.map((row) => row.id));
	for (const id of states.keys()) if (!live.has(id)) states.delete(id);
	const now = Date.now();
	for (const row of subscriptions) {
		let state = states.get(row.id);
		if (state === undefined || state.revision !== row.revision) {
			state = { revision: row.revision, firstSeen: now, published: new Set(), finished: false, nextAt: 0, failures: 0 };
			states.set(row.id, state);
		}
		if (state.finished || now < state.nextAt) continue;
		try {
			await check(ctx, config, github, store, row, state);
			state.failures = 0;
			delete state.lastError;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			state.failures++;
			state.nextAt = Date.now() + Math.min((config.pollMs ?? DEFAULTS.pollMs) * 2 ** state.failures, RETRY_MAX_MS);
			if (message !== state.lastError) console.error(`p2 github-checks: ${row.id}: ${message}`);
			state.lastError = message;
		}
	}
	const due = [...states.values()].filter((state) => !state.finished).map((state) => state.nextAt);
	return due.length === 0 ? 3_000 : Math.min(Math.max(0, Math.min(...due) - Date.now()), 60_000);
}

async function check(
	ctx: Ctx,
	config: Config,
	github: GithubClient,
	store: Ref<typeof WakeStore>,
	row: Subscription,
	state: State,
): Promise<void> {
	const poll = config.pollMs ?? DEFAULTS.pollMs;
	GithubChecks.validateConfig(row.config);
	const watched = row.config as WatchConfig;
	if (!repoAllowed(watched.repo, config.repos)) throw new Error(`${watched.repo} is not in the allowed repositories`);
	const now = Date.now();
	const head = await github.head(watched.repo, watched.ref as WatchRef);
	if (!/^[0-9a-f]{40}$/.test(head.sha)) throw new Error(`GitHub returned no commit for ${refLabel(watched.ref as WatchRef)}`);
	if (state.sha !== head.sha) {
		state.sha = head.sha;
		state.firstSeen = now;
		delete state.doneAt;
		delete state.fingerprint;
	}
	const items = itemsOf(
		await github.runs(watched.repo, head.sha),
		await github.statuses(watched.repo, head.sha),
		watched.only,
	);
	const verdict = decide(items);
	let result: Result;
	if (verdict === "pending") {
		delete state.doneAt;
		state.nextAt = now + poll;
		return;
	}
	if (verdict === "none") {
		// A commit's checks can appear a little after it does: wait before saying that none ran.
		if (now - state.firstSeen < (config.graceMs ?? DEFAULTS.graceMs)) {
			state.nextAt = now + poll;
			return;
		}
		result = "no-checks";
	} else {
		result = verdict;
	}
	const fingerprint = JSON.stringify(items.map((item) => [item.name, item.conclusion]).sort());
	if (state.fingerprint !== fingerprint) {
		state.fingerprint = fingerprint;
		state.doneAt = now;
	}
	const settle = config.settleMs ?? DEFAULTS.settleMs;
	const waited = now - (state.doneAt ?? now);
	if (waited < settle) {
		state.nextAt = now + Math.min(poll, settle - waited);
		return;
	}
	const eventId = `${head.sha}:${result}`;
	if (!state.published.has(eventId)) {
		// Say nothing of a green commit when the subscription only wants failures; the commit is still done.
		if (watched.notify !== "failure" || (result !== "passed" && result !== "no-checks")) {
			const publisher = bindStimulusPublisher(store, GithubChecks, row);
			await publisher.publish(
				{
					eventId,
					event: {
						repo: watched.repo,
						ref: watched.ref,
						sha: head.sha,
						result,
						checks: eventChecks(items),
						url: head.url,
					},
				},
				ctx,
			);
		}
		state.published.add(eventId);
	}
	// A pinned commit and a closed pull request get no new commits; a branch or open pull request may.
	if (head.closed) state.finished = true;
	else state.nextAt = Date.now() + (config.idleMs ?? DEFAULTS.idleMs);
}
