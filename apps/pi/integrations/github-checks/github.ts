// A read-only GitHub REST client for the checks poller: conditional requests (a 304 costs no rate limit), a timeout on
// every call, and nothing else.
import type { WatchRef } from "./contract.ts";

export class GithubError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

type Json = Record<string, unknown>;

export type Head = {
	sha: string;
	url: string;
	/** A pull request that is merged or closed will not get new commits. */
	closed: boolean;
};

export type GithubClient = {
	head(repo: string, ref: WatchRef): Promise<Head>;
	runs(repo: string, sha: string): Promise<Json[]>;
	statuses(repo: string, sha: string): Promise<Json[]>;
};

export function githubClient(options: { token: string; apiBase: string; timeoutMs?: number }): GithubClient {
	const cache = new Map<string, { etag: string; body: Json }>();
	const get = async (path: string): Promise<Json> => {
		const url = `${options.apiBase}${path}`;
		const cached = cache.get(url);
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${options.token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": "pi-github-checks",
				...(cached === undefined ? {} : { "If-None-Match": cached.etag }),
			},
			redirect: "error",
			signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
		});
		if (response.status === 304 && cached !== undefined) return cached.body;
		if (!response.ok) {
			const remaining = response.headers.get("x-ratelimit-remaining");
			throw new GithubError(
				response.status,
				response.status === 403 && remaining === "0"
					? "GitHub rate limit reached"
					: `GitHub ${response.status} for ${path.split("?")[0]}`,
			);
		}
		const body = (await response.json()) as Json;
		const etag = response.headers.get("etag");
		if (etag !== null) cache.set(url, { etag, body });
		return body;
	};
	const repoPath = (repo: string) => `/repos/${repo}`;
	const list = (body: Json, key: string): Json[] => (Array.isArray(body[key]) ? (body[key] as Json[]) : []);
	return {
		async head(repo, ref) {
			if (ref.kind === "pr") {
				const pull = await get(`${repoPath(repo)}/pulls/${ref.number}`);
				const head = pull.head as Json | undefined;
				const sha = typeof head?.sha === "string" ? head.sha : "";
				return {
					sha,
					url: typeof pull.html_url === "string" ? pull.html_url : `https://github.com/${repo}/pull/${ref.number}`,
					closed: pull.state === "closed" || pull.merged === true,
				};
			}
			if (ref.kind === "branch") {
				const branch = await get(`${repoPath(repo)}/branches/${encodeURIComponent(ref.name)}`);
				const commit = branch.commit as Json | undefined;
				const sha = typeof commit?.sha === "string" ? commit.sha : "";
				return { sha, url: `https://github.com/${repo}/tree/${ref.name}`, closed: false };
			}
			const commit = await get(`${repoPath(repo)}/commits/${ref.sha}`);
			return {
				sha: typeof commit.sha === "string" ? commit.sha : ref.sha,
				url: typeof commit.html_url === "string" ? commit.html_url : `https://github.com/${repo}/commit/${ref.sha}`,
				closed: true,
			};
		},
		async runs(repo, sha) {
			const runs: Json[] = [];
			for (let page = 1; page <= 5; page++) {
				const body = await get(`${repoPath(repo)}/commits/${sha}/check-runs?per_page=100&page=${page}`);
				const items = list(body, "check_runs");
				runs.push(...items);
				if (items.length < 100) break;
			}
			return runs;
		},
		async statuses(repo, sha) {
			return list(await get(`${repoPath(repo)}/commits/${sha}/status`), "statuses");
		},
	};
}
