// The poller: Pi looks at the commits its subscriptions watch and, once a commit's checks have all finished, publishes one
// event (passed, failed, cancelled or no checks) that wakes the subscribed session. Stimuli own persistence, delivery
// and retry; this only decides when a commit is done and publishes it once.
import { compile, type Static } from "@earendil-works/pi-schema";
import { type Ctx, isChordError, type Ref, signalOf } from "@p2/app/v1";
import { bindStimulusPublisher, type SubscriptionSchema, WakeStore } from "@p2/app/v1/server";
import type { Access } from "./access.ts";
import { decide, eventChecks, instanceOf, type Item, itemsOf, refLabel, repoAllowed } from "./checks.ts";
import { GithubChecks } from "./contract.server.ts";
import { SOURCE_ID, SOURCE_VERSION, WatchSchema } from "./contract.ts";
import { GithubError, type GithubClient } from "./github.ts";
import type { Settings } from "./settings.ts";

const watchCheck = compile(WatchSchema);
type Subscription = Static<typeof SubscriptionSchema>;

const RETRY_MAX_MS = 300_000;
/** How long to wait before asking again about a watch GitHub or the allowlist refused. */
const REFUSED_RETRY_MS = 3_600_000;

/** A subscription the allowlist refuses: asked about again only after a long wait. */
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
	/** No more looking until the subscription changes: a pinned commit or closed pull request that has been quiet. */
	finished: boolean;
	nextAt: number;
	failures: number;
	lastError?: string;
};
/** The subscriptions' states, and what the settings were when they were made. */
export type States = Map<string, State> & { environment: string | undefined };
export const newStates = (): States => Object.assign(new Map<string, State>(), { environment: undefined });

/** One look at every watched subscription that is due; returns how long to wait until the next one is. */
export async function pass(ctx: Ctx, access: Access, states: States): Promise<number> {
	const store = await ctx.get(WakeStore, {});
	const subscriptions = (await store.subscriptions({}, ctx)).filter(
		(row) => row.enabled && row.source.id === SOURCE_ID && row.source.version === SOURCE_VERSION,
	);
	// Nothing to watch: read no settings and ask no `gh`.
	if (subscriptions.length === 0) {
		states.clear();
		return 3_000;
	}
	const { settings, github } = await access.get(ctx);
	// When what decides whether a watch is allowed or readable changes, what failed before may work now.
	const environment = JSON.stringify([settings.repos, settings.apiBase, settings.token, github.key]);
	if (states.environment !== environment) {
		states.clear();
		states.environment = environment;
	}
	const live = new Set(subscriptions.map((row) => row.id));
	for (const id of states.keys()) if (!live.has(id)) states.delete(id);
	const signal = signalOf(ctx);
	for (const row of subscriptions) {
		if (signal.aborted || Date.now() < github.pausedUntil()) break;
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
			// What GitHub or the allowlist refuses (an unknown pull request, a repository not listed, a session that may not
			// be written to) rarely changes: ask again in an hour, not every few minutes.
			const refused =
				error instanceof Permanent ||
				(error instanceof GithubError && error.permanent) ||
				(isChordError(error) && error.code === "forbidden");
			state.failures++;
			state.nextAt = Math.max(
				Date.now() + (refused ? REFUSED_RETRY_MS : Math.min(settings.pollMs * 2 ** state.failures, RETRY_MAX_MS)),
				github.pausedUntil(),
			);
			if (message !== state.lastError)
				console.error(`p2 github-checks: ${row.id}: ${message}${refused ? " (looking again in an hour)" : ""}`);
			state.lastError = message;
		}
	}
	// Rows skipped during a rate-limit pause are still due: wait out the pause instead of spinning.
	const paused = github.pausedUntil() - Date.now();
	if (paused > 0) return Math.min(paused, 5_000);
	const due = [...states.values()].filter((state) => !state.finished).map((state) => state.nextAt);
	// Never wait long: a new watch should not be kept waiting.
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
	// A named check can appear after the others (a job behind `needs:`).
	const missing = only.some((name) => !items.some((item) => item.name === name));
	if (missing && (all.some((item) => !item.done) || now - state.firstSeen < settings.graceMs)) verdict = "pending";
	if (verdict === "pending") {
		delete state.instance;
		delete state.doneAt;
		state.nextAt = now + settings.pollMs;
		return;
	}
	if (verdict === "none" && now - state.firstSeen < settings.graceMs) {
		// A commit's checks can appear a little after it does.
		delete state.instance;
		delete state.doneAt;
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
	// A pinned commit or closed pull request gets no new commits, but a later stage or re-run can change its checks:
	// keep looking until they have been quiet for `lingerMs`.
	if (head.closed && Date.now() - (state.doneAt ?? now) >= settings.lingerMs) state.finished = true;
	else state.nextAt = Date.now() + settings.idleMs;
}
