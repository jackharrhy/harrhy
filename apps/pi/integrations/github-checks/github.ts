// A read-only GitHub REST client for the checks poller: conditional requests (a 304 costs no rate limit), a timeout and
// the caller's abort signal on every call, a pause when GitHub asks for one, and nothing else.
import type { WatchRef } from "./contract.ts";

export class GithubError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
	/** The thing asked about is not there or not valid: asking again will not change that. */
	get permanent(): boolean {
		return this.status === 404 || this.status === 410 || this.status === 422;
	}
}

type Json = Record<string, unknown>;

export type Head = {
	sha: string;
	url: string;
	/** A pull request that is closed or merged, or a pinned commit, will not get new commits. */
	closed: boolean;
};

export type GithubClient = {
	/** The login the token belongs to. */
	user(signal?: AbortSignal): Promise<string>;
	head(repo: string, ref: WatchRef, signal?: AbortSignal): Promise<Head>;
	runs(repo: string, sha: string, signal?: AbortSignal): Promise<Json[]>;
	statuses(repo: string, sha: string, signal?: AbortSignal): Promise<Json[]>;
	/** When GitHub last told this client to wait until, in ms since the epoch (0: not at all). */
	pausedUntil(): number;
	/** Names this client's credentials and host, so a changed one is noticed. */
	key: string;
};

const CACHE_ENTRIES = 200;
const PAGE = 100;
const MAX_PAGES = 10;

export function githubClient(options: { token: string; apiBase: string }): GithubClient {
	// Bodies by URL for If-None-Match; oldest dropped, so a long-lived watcher of a busy branch stays small.
	const cache = new Map<string, { etag: string; body: Json }>();
	let paused = 0;
	const get = async (path: string, signal?: AbortSignal): Promise<Json> => {
		const url = `${options.apiBase}${path}`;
		const cached = cache.get(url);
		const timeout = AbortSignal.timeout(15_000);
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${options.token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": "pi-github-checks",
				...(cached === undefined ? {} : { "If-None-Match": cached.etag }),
			},
			redirect: "error",
			signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
		});
		if (response.status === 304 && cached !== undefined) {
			// Newest use last, so a URL asked about every poll is not the one dropped.
			cache.delete(url);
			cache.set(url, cached);
			return cached.body;
		}
		if (!response.ok) {
			const retryAfter = Number(response.headers.get("retry-after"));
			const reset = Number(response.headers.get("x-ratelimit-reset"));
			const limited = response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
			if (limited) {
				paused = Math.max(paused, Number.isFinite(retryAfter) && retryAfter > 0 ? Date.now() + retryAfter * 1000 : reset > 0 ? reset * 1000 : Date.now() + 60_000);
				throw new GithubError(response.status, "GitHub rate limit reached");
			}
			throw new GithubError(response.status, `GitHub ${response.status} for ${path.split("?")[0]}`);
		}
		const body = (await response.json()) as Json;
		const etag = response.headers.get("etag");
		if (etag !== null) {
			cache.delete(url);
			cache.set(url, { etag, body });
			if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
		}
		return body;
	};
	const pages = async (path: string, key: string, signal?: AbortSignal): Promise<Json[]> => {
		const items: Json[] = [];
		for (let page = 1; page <= MAX_PAGES; page++) {
			const body = await get(`${path}${path.includes("?") ? "&" : "?"}per_page=${PAGE}&page=${page}`, signal);
			const batch = Array.isArray(body[key]) ? (body[key] as Json[]) : [];
			items.push(...batch);
			const total = typeof body.total_count === "number" ? body.total_count : undefined;
			if (batch.length < PAGE || (total !== undefined && items.length >= total)) return items;
		}
		// Judging part of a commit's checks could report a pass that is not one.
		throw new Error(`More than ${MAX_PAGES * PAGE} checks on one commit`);
	};
	const sha = (value: unknown) => (typeof value === "string" ? value : "");
	return {
		async user(signal) {
			const user = await get("/user", signal);
			return typeof user.login === "string" ? user.login : "unknown";
		},
		async head(repo, ref, signal) {
			if (ref.kind === "pr") {
				const pull = await get(`/repos/${repo}/pulls/${ref.number}`, signal);
				return {
					sha: sha((pull.head as Json | undefined)?.sha),
					url: typeof pull.html_url === "string" ? pull.html_url : `https://github.com/${repo}/pull/${ref.number}`,
					closed: pull.state === "closed",
				};
			}
			if (ref.kind === "branch") {
				const branch = await get(`/repos/${repo}/branches/${encodeURIComponent(ref.name)}`, signal);
				const html = (branch._links as Json | undefined)?.html;
				return {
					sha: sha((branch.commit as Json | undefined)?.sha),
					url: typeof html === "string" ? html : `https://github.com/${repo}/tree/${encodeURIComponent(ref.name)}`,
					closed: false,
				};
			}
			// A full hash needs no lookup; a short one is resolved to the full one.
			if (ref.sha.length === 40) return { sha: ref.sha, url: `https://github.com/${repo}/commit/${ref.sha}`, closed: true };
			const commit = await get(`/repos/${repo}/commits/${ref.sha}`, signal);
			return {
				sha: sha(commit.sha),
				url: typeof commit.html_url === "string" ? commit.html_url : `https://github.com/${repo}/commit/${ref.sha}`,
				closed: true,
			};
		},
		runs: (repo, commit, signal) => pages(`/repos/${repo}/commits/${commit}/check-runs`, "check_runs", signal),
		statuses: (repo, commit, signal) => pages(`/repos/${repo}/commits/${commit}/status`, "statuses", signal),
		pausedUntil: () => paused,
		key: `${options.apiBase}\n${options.token}`,
	};
}
