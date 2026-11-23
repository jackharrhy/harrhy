import { defineExtension } from "@earendil-works/pi-durable";
import { bool, int, obj, opt } from "@earendil-works/pi-schema";
import { contribute, defineFacet, expectVariant } from "@p2/app/v1";
import { defineP2Tool, Extensions, type P2Tool, Subscriptions, workerOf } from "@p2/app/v1/worker";
import { Metric, Rule, Source, WatchId } from "./contract.ts";

const output = (value: unknown) => ({ output: [{ type: "text" as const, text: JSON.stringify(value) }] });

export default defineFacet((host) => {
	contribute(host, "p2.host-health.tools", (self) => {
		const worker = workerOf(self);
		const extension = defineExtension<P2Tool>({
			name: "p2-host-health",
			namespace: {
				name: "host_health",
				description: "Manage opt-in host resource watches for this session.",
				instructions: "Create or pause watches only with owner authorization. Disk values are GiB; CPU and memory values are percentages from 0 to 100. Omitting rule uses the preset. A watch does not authorize cleanup.",
			},
			tools: [
				defineP2Tool({
					name: "host_watch_create",
					description: "Create a resource watch targeting this private conversation.",
					parameters: obj({ id: WatchId, check: Metric, rule: opt(Rule) }),
					replay: "safe",
					callers: ["tools"],
					locked: "never",
					execute: async ({ id, ...config }, api, context) => output(await worker().root(async (ctx) =>
						expectVariant(await ctx.get(Subscriptions, {}), "worker").create({
							id, source: Source, conversation: api.conversationId, config,
						}, ctx), context)),
				}),
				defineP2Tool({
					name: "host_watch_list",
					description: "List host resource watches and their revisions in this session.",
					parameters: obj({}),
					replay: "safe",
					callers: ["tools"],
					locked: "never",
					execute: async (_args, _api, context) => output(await worker().root(async (ctx) => {
						const subscriptions = expectVariant(await ctx.get(Subscriptions, {}), "worker");
						return (await subscriptions.list({}, ctx)).filter((row) => row.source.id === Source.id);
					}, context)),
				}),
				defineP2Tool({
					name: "host_watch_set_enabled",
					description: "Pause or resume a host resource watch using the revision from the list.",
					parameters: obj({ id: WatchId, expectedRevision: int(), enabled: bool() }),
					replay: "safe",
					callers: ["tools"],
					locked: "never",
					execute: async (args, _api, context) => output(await worker().root(async (ctx) => {
						const subscriptions = expectVariant(await ctx.get(Subscriptions, {}), "worker");
						const row = (await subscriptions.list({}, ctx)).find((row) => row.id === args.id);
						if (row?.source.id !== Source.id) throw new Error("No such host health watch in this session");
						return subscriptions.setEnabled(args, ctx);
					}, context)),
				}),
			],
		});
		self.contribute(Extensions, { host_health: extension });
	});
});
