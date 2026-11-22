// The agent's side: tools to watch a pull request, branch or commit and be woken when its checks finish.
import { createHash } from "node:crypto";
import { defineExtension } from "@earendil-works/pi-durable";
import { arr, int, obj, opt, str, union } from "@earendil-works/pi-schema";
import { defineFacet, expectVariant, local } from "@p2/app/v1";
import { defineP2Tool, Extensions, type P2Tool, Subscriptions, workerOf } from "@p2/app/v1/worker";
import { compile } from "@earendil-works/pi-schema";
import { ConfigSchema, refLabel, SOURCE_ID, SOURCE_VERSION, type WatchConfig, type WatchRef } from "./contract.ts";

const Tools = local("p2.github-checks-tools", { version: 1, params: {}, members: {} });
const SOURCE = { id: SOURCE_ID, version: SOURCE_VERSION };
const configCheck = compile(ConfigSchema);

const text = (value: unknown) => ({ output: [{ type: "text" as const, text: JSON.stringify(value) }] });

export default defineFacet((host) => {
	host.serve(Tools, (_params, self) => {
		const worker = workerOf(self);
		const extension = defineExtension<P2Tool>({
			name: "p2-github-checks",
			tools: [
				defineP2Tool({
					name: "github_checks_watch",
					description:
						"Watch the GitHub checks (Actions and commit statuses) of a pull request, branch or commit and wake this conversation when they finish, passed or failed, so there is no need to poll. Give exactly one of `pr`, `branch` or `commit`. A pull request or branch is followed: each new commit reports its own result (a branch such as main reports every commit). A commit reports once. The repository must be one the owner allowed. Returns the subscription.",
					parameters: obj({
						repo: str({ description: "owner/name" }),
						pr: opt(int({ minimum: 1 })),
						branch: opt(str({ minLength: 1 })),
						commit: opt(str({ pattern: "^[0-9a-f]{7,40}$" })),
						notify: opt(union([str({ pattern: "^all$" }), str({ pattern: "^failure$" })])),
						only: opt(arr(str({ minLength: 1 }), { maxItems: 32 })),
					}),
					replay: "safe",
					locked: "never",
					execute: async (args, api, context) => {
						const given = [args.pr, args.branch, args.commit].filter((value) => value !== undefined);
						if (given.length !== 1) throw new Error("Give exactly one of pr, branch or commit");
						const ref: WatchRef =
							args.pr !== undefined
								? { kind: "pr", number: args.pr }
								: args.branch !== undefined
									? { kind: "branch", name: args.branch }
									: { kind: "commit", sha: args.commit as string };
						const config: WatchConfig = {
							repo: args.repo,
							ref,
							...(args.notify === undefined ? {} : { notify: args.notify as "all" | "failure" }),
							...(args.only === undefined ? {} : { only: args.only }),
						};
						if (!configCheck.check(config)) throw new Error("Invalid watch: repo must be owner/name");
						const id = `github-checks-${api.conversationId}-${createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16)}`;
						const row = await worker().root(async (ctx) => {
							const subscriptions = expectVariant(await ctx.get(Subscriptions, {}), "worker");
							const existing = (await subscriptions.list({}, ctx)).find((entry) => entry.id === id);
							if (existing !== undefined)
								return existing.enabled
									? existing
									: subscriptions.setEnabled({ id, expectedRevision: existing.revision, enabled: true }, ctx);
							return subscriptions.create({ id, source: SOURCE, conversation: api.conversationId, config }, ctx);
						}, context);
						return text({ id: row.id, watching: `${config.repo} ${refLabel(ref)}`, enabled: row.enabled });
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
