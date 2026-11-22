// The agent's side: tools to watch a pull request, branch or commit and be woken when its checks finish.
import { createHash } from "node:crypto";
import { defineExtension } from "@earendil-works/pi-durable";
import { arr, compile, int, obj, opt, str, union } from "@earendil-works/pi-schema";
import { defineFacet, expectVariant, literal, local } from "@p2/app/v1";
import { defineP2Tool, Extensions, type P2Tool, Subscriptions, workerOf } from "@p2/app/v1/worker";
import { refLabel } from "./checks.ts";
import { GithubChecksProbe, SOURCE_ID, SOURCE_VERSION, type Watch, WatchSchema } from "./contract.ts";

const Tools = local("p2.github-checks-tools", { version: 1, params: {}, members: {} });
const SOURCE = { id: SOURCE_ID, version: SOURCE_VERSION };
const watchCheck = compile(WatchSchema);

const text = (value: unknown) => ({ output: [{ type: "text" as const, text: JSON.stringify(value) }] });

/** The same watch always has the same ID, however it was spelled; the ID belongs to one conversation of one session. */
function watchId(session: string, conversation: number, watch: Watch): string {
	const only = [...new Set(watch.only ?? [])].sort();
	const normal = { repo: watch.repo.toLowerCase(), ref: watch.ref, notify: watch.notify ?? "all", only };
	const hash = createHash("sha256")
		.update(JSON.stringify([session, conversation, normal]))
		.digest("hex");
	return `github-checks-${hash.slice(0, 24)}`;
}

export default defineFacet((host) => {
	host.serve(Tools, (_params, self) => {
		const worker = workerOf(self);
		const extension = defineExtension<P2Tool>({
			name: "p2-github-checks",
			tools: [
				defineP2Tool({
					name: "github_checks_watch",
					description:
						"Watch the GitHub checks (Actions and commit statuses) of a pull request, branch or commit and wake this conversation when they finish, passed or failed, so there is no need to poll. Give exactly one of `pr`, `branch` or `commit`. A pull request or branch is followed: when a newer commit's checks finish, that result is reported too (a commit replaced before its checks finish is not). A commit reports once. The repository must be one the owner allowed; this fails if it is not or if GitHub does not know the target. Returns the watch.",
					parameters: obj({
						repo: str({ description: "owner/name" }),
						pr: opt(int({ minimum: 1 })),
						branch: opt(str({ minLength: 1 })),
						commit: opt(str({ pattern: "^[0-9a-f]{7,40}$" })),
						notify: opt(union([literal("all"), literal("failure")])),
						only: opt(arr(str({ minLength: 1 }), { maxItems: 32 })),
					}),
					replay: "safe",
					locked: "never",
					execute: async (args, api, context) => {
						if ([args.pr, args.branch, args.commit].filter((value) => value !== undefined).length !== 1)
							throw new Error("Give exactly one of pr, branch or commit");
						const watch = {
							repo: args.repo,
							ref:
								args.pr !== undefined
									? { kind: "pr", number: args.pr }
									: args.branch !== undefined
										? { kind: "branch", name: args.branch }
										: { kind: "commit", sha: args.commit },
							...(args.notify === undefined ? {} : { notify: args.notify }),
							...(args.only === undefined ? {} : { only: args.only }),
						};
						if (!watchCheck.check(watch)) throw new Error("Not a valid watch: repo is owner/name, and a ref needs a valid value");
						const row = await worker().root(async (ctx) => {
							// The server refuses what the allowlist does not cover and what GitHub does not know.
							await expectVariant(await ctx.get(GithubChecksProbe, {}), "worker").probe({ repo: watch.repo, ref: watch.ref }, ctx);
							const subscriptions = expectVariant(await ctx.get(Subscriptions, {}), "worker");
							const id = watchId(worker().init.values.session.id, api.conversationId, watch);
							const existing = (await subscriptions.list({}, ctx)).find((entry) => entry.id === id);
							if (existing === undefined)
								return subscriptions.create({ id, source: SOURCE, conversation: api.conversationId, config: watch }, ctx);
							return existing.enabled
								? existing
								: subscriptions.setEnabled({ id, expectedRevision: existing.revision, enabled: true }, ctx);
						}, context);
						return text({ id: row.id, watching: `${watch.repo} ${refLabel(watch.ref)}`, enabled: row.enabled });
					},
				}),
				defineP2Tool({
					name: "github_checks_list",
					description: "List this session's GitHub checks watches.",
					parameters: obj({}),
					replay: "safe",
					locked: "never",
					execute: async (_args, _api, context) =>
						text(
							await worker().root(async (ctx) => {
								const rows = await expectVariant(await ctx.get(Subscriptions, {}), "worker").list({}, ctx);
								return rows
									.filter((row) => row.source.id === SOURCE_ID)
									.map((row) => ({ id: row.id, enabled: row.enabled, config: row.config }));
							}, context),
						),
				}),
				defineP2Tool({
					name: "github_checks_stop",
					description: "Stop a GitHub checks watch by its id (from github_checks_watch or github_checks_list).",
					parameters: obj({ id: str() }),
					replay: "safe",
					locked: "never",
					execute: async (args, _api, context) =>
						text(
							await worker().root(async (ctx) => {
								const subscriptions = expectVariant(await ctx.get(Subscriptions, {}), "worker");
								const row = (await subscriptions.list({}, ctx)).find((entry) => entry.id === args.id);
								if (row === undefined || row.source.id !== SOURCE_ID) throw new Error("No such watch");
								const stopped = await subscriptions.setEnabled(
									{ id: row.id, expectedRevision: row.revision, enabled: false },
									ctx,
								);
								return { id: stopped.id, enabled: stopped.enabled };
							}, context),
						),
				}),
			],
		});
		self.contribute(Extensions, { [extension.name]: extension });
		return {};
	});
});
