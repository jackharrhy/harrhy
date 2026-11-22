// Reading GitHub: the settings and a client for them, with the token from the config or from `gh auth token`.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Ctx } from "@p2/app/v1";
import { processLogs } from "@p2/app/v1/node";
import { type GithubClient, githubClient } from "./github.ts";
import { readSettings, type Settings } from "./settings.ts";

const TOKEN_TTL_MS = 3_600_000;
const run = promisify(execFile);

/** The host `gh auth token` is asked about: the web host of the API (`api.github.com` is `github.com`). */
function ghHostname(apiBase: string): string {
	return new URL(apiBase).hostname.replace(/^api\./, "");
}

/** The token is `token` from the config, else `gh auth token`, kept for an hour. */
export function createAccess() {
	let fetched: { key: string; value: string; at: number } | undefined;
	let failed: { key: string; at: number; error: Error } | undefined;
	let asking: { key: string; token: Promise<string> } | undefined;
	let client: { key: string; github: GithubClient } | undefined;
	const ghToken = (command: string, hostname: string): Promise<string> => {
		const key = `${command}\n${hostname}`;
		if (fetched?.key === key && Date.now() - fetched.at < TOKEN_TTL_MS) return Promise.resolve(fetched.value);
		if (asking?.key === key) return asking.token;
		// `gh` just failed: give the same answer for a minute instead of running it again.
		if (failed?.key === key && Date.now() - failed.at < 60_000) return Promise.reject(failed.error);
		const attempt = (async () => {
			try {
				const { stdout } = await run(command, ["auth", "token", "--hostname", hostname], {
					timeout: 10_000,
					maxBuffer: 8192,
				});
				const token = stdout.trim();
				if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error("`gh auth token` did not return a token");
				processLogs.redactor.addSecret(token);
				fetched = { key, value: token, at: Date.now() };
				failed = undefined;
				return token;
			} catch (error) {
				// An hour-old token is probably still good: keep it when `gh` fails now, and try `gh` again in five minutes.
				if (fetched?.key === key) {
					fetched.at = Date.now() - TOKEN_TTL_MS + 300_000;
					return fetched.value;
				}
				const reason =
					error instanceof Error && error.message.startsWith("`gh auth token`")
						? error
						: new Error(
								(error as NodeJS.ErrnoException).code === "ENOENT"
									? `\`${command}\` not found: set \`ghPath\` to its full path, or set \`token\``
									: "No GitHub token: set `token` in github-checks.json, or sign in with `gh auth login`",
							);
				failed = { key, at: Date.now(), error: reason };
				throw reason;
			} finally {
				if (asking?.key === key) asking = undefined;
			}
		})();
		asking = { key, token: attempt };
		return attempt;
	};
	return {
		/** The next read asks `gh` again (GitHub refused the token). */
		forgetToken() {
			fetched = undefined;
		},
		async get(ctx: Ctx): Promise<{ settings: Settings; github: GithubClient }> {
			const settings = await readSettings(ctx);
			const token = settings.token ?? (await ghToken(settings.ghPath, ghHostname(settings.apiBase)));
			const key = `${settings.apiBase}\n${token}`;
			if (client?.key !== key) client = { key, github: githubClient({ token, apiBase: settings.apiBase }) };
			return { settings, github: client.github };
		},
	};
}
export type Access = ReturnType<typeof createAccess>;

