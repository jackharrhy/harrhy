// GitHub checks as a stimulus source (README.md): the owner's settings, the probe the agent's tools call, and the poller
// that watches GitHub for the subscriptions.
import {
	contribute,
	defineFacet,
	deriveTyped,
	forbidden,
	invalid,
	isOwner,
	isWorker,
	signalOf,
	sleep,
} from "@p2/app/v1";
import { StimulusSources, sourceKey } from "@p2/app/v1/server";
import { createAccess } from "./access.ts";
import { refLabel, repoAllowed } from "./checks.ts";
import { GithubChecks } from "./contract.server.ts";
import { GithubChecksProbe, GithubChecksSettings } from "./contract.ts";
import { GithubError } from "./github.ts";
import { newStates, pass } from "./poller.ts";
import { Allowed, AllowedStore, MAX_REPOS, REPO } from "./settings.ts";

export default defineFacet((host) => {
	const access = createAccess();
	host.serve(AllowedStore, (_params, self) => {
		const state = self.state(Allowed);
		return {
			repos: deriveTyped(self, [state], ([value]) => value.repos),
			allow: async ({ repo }, ctx) => {
				await state.change((draft) => {
					if (draft.repos.some((have) => have.toLowerCase() === repo.toLowerCase())) return;
					if (draft.repos.length >= MAX_REPOS) throw invalid("args", `At most ${MAX_REPOS} repositories`);
					draft.repos.push(repo);
				}, ctx);
				return null;
			},
			remove: async ({ repo }, ctx) => {
				await state.change((draft) => {
					draft.repos = draft.repos.filter((have) => have.toLowerCase() !== repo.toLowerCase());
				}, ctx);
				return null;
			},
		};
	});
	host.serve(GithubChecksSettings, (_params, principal, self) => {
		if (!isOwner(principal)) throw forbidden("GitHub checks settings are the owner's");
		const store = self.get(AllowedStore, {});
		return {
			variant: "owner",
			members: {
				repos: store.repos,
				allow: ({ repo }, ctx) => {
					const name = repo.trim();
					if (!REPO.test(name)) throw invalid("args", "Use owner/name, or owner/* for every repository of an owner");
					return store.allow({ repo: name }, ctx);
				},
				remove: ({ repo }, ctx) => store.remove({ repo }, ctx),
				checkLogin: async (_args, ctx) => {
					try {
						const { github } = await access.get(ctx);
						return { ok: true, message: `Reading GitHub as ${await github.user(signalOf(ctx))}` };
					} catch (error) {
						if (error instanceof GithubError && error.status === 401) access.forgetToken();
						return { ok: false, message: error instanceof Error ? error.message : String(error) };
					}
				},
			},
		};
	});
	host.serve(GithubChecksProbe, (_params, principal) => {
		if (!isWorker(principal)) throw forbidden("GitHub checks probes are for session workers");
		return {
			variant: "worker",
			members: {
				probe: async ({ repo, ref }, ctx) => {
					const { settings, github } = await access.get(ctx);
					if (!repoAllowed(repo, settings.repos)) throw new Error(`${repo} is not a repository Pi may watch: the owner can allow it in Settings › GitHub`);
					const signal = signalOf(ctx);
					try {
						const head = await github.head(repo, ref, signal);
						if (!/^[0-9a-f]{40}$/.test(head.sha)) throw new Error(`GitHub knows no commit for ${refLabel(ref)}`);
						// A full commit hash needs no lookup to resolve, so ask GitHub for its checks to see that it exists.
						if (ref.kind === "commit") await github.runs(repo, head.sha, signal);
						return { sha: head.sha };
					} catch (error) {
						if (error instanceof GithubError && error.status === 401) access.forgetToken();
						throw error;
					}
				},
			},
		};
	});
	contribute(host, "p2.github-checks-poller", (self) => {
		self.contribute(StimulusSources, { [sourceKey(GithubChecks)]: GithubChecks });
		self.onLive(async (ctx) => {
			const signal = signalOf(ctx);
			const states = newStates();
			let problem: string | undefined;
			while (!signal.aborted) {
				let wait: number;
				try {
					wait = await pass(ctx, access, states);
					problem = undefined;
				} catch (error) {
					if (signal.aborted) break;
					const message = error instanceof Error ? error.message : String(error);
					// Say each problem once (a missing `gh` login, a broken config file).
					if (message !== problem) console.error(`p2 github-checks: ${message}`);
					problem = message;
					wait = 3_000;
				}
				if (!signal.aborted) await sleep(Math.max(20, wait), ctx).catch(() => {});
			}
		});
	});
});
