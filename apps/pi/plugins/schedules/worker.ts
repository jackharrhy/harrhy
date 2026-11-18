// Conversation tools manage only their own session's schedules; recurring execution remains server-owned.
import { defineExtension } from "@earendil-works/pi-durable";
import { bool, int, obj, str } from "@earendil-works/pi-schema";
import { contribute, defineFacet, expectVariant } from "@p2/app/v1";
import { defineP2Tool, Extensions, type P2Tool, workerOf } from "@p2/app/v1/worker";
import { DefinitionSchema, Schedules } from "./contract.ts";

export default defineFacet((host) => {
	contribute(host, "p2.schedules.tools", (self) => {
		const worker = workerOf(self);
		const extension = defineExtension<P2Tool>({
			name: "p2-schedules",
			namespace: {
				name: "schedules",
				description:
					"Durable cron-like recurring prompts in this session, with explicit timezone and one missed-run catch-up.",
				instructions:
					"Create uses this conversation as exact target. Use an IANA timezone, not a fixed offset; Newfoundland is America/St_Johns. Cron has five fields (minute hour day month weekday), or six with seconds first. Schedules publish external input; admission is not business completion. Pause/resume and update use the revision from schedule_list. Resuming starts in the future without paused backlog. schedule_run manually publishes once, independently of the next scheduled occurrence. A disabled/archived/shared target never grants new authority. Do not create automatic business actions without owner authorization.",
			},
			tools: [
				defineP2Tool({
					name: "schedule_create",
					description:
						"Create a named recurring prompt targeting this conversation. Persisted across restart; no model runs while waiting.",
					parameters: DefinitionSchema,
					replay: "safe",
					callers: ["tools"],
					locked: "never",
					execute: async (definition, api, context) => ({
						output: [
							{
								type: "text",
								text: JSON.stringify(
									await worker().root(
										async (ctx) =>
											expectVariant(await ctx.get(Schedules, {}), "worker").create(
												{ definition, conversation: api.conversationId },
												ctx,
											),
										context,
									),
								),
							},
						],
					}),
				}),
				defineP2Tool({
					name: "schedule_update",
					description:
						"Replace a schedule's definition and target it to this conversation. Retires the previous binding and starts a future occurrence.",
					parameters: obj({ definition: DefinitionSchema, expectedRevision: int() }),
					replay: "safe",
					callers: ["tools"],
					locked: "never",
					execute: async (args, api, context) => ({
						output: [
							{
								type: "text",
								text: JSON.stringify(
									await worker().root(
										async (ctx) =>
											expectVariant(await ctx.get(Schedules, {}), "worker").update(
												{ ...args, conversation: api.conversationId },
												ctx,
											),
										context,
									),
								),
							},
						],
					}),
				}),
				defineP2Tool({
					name: "schedule_list",
					description:
						"List this session's schedules, revisions, next local/UTC occurrence, pending publication and last error. No scans or business execution.",
					parameters: obj({}),
					replay: "safe",
					callers: ["tools"],
					locked: "never",
					execute: async (_args, _api, context) => ({
						output: [
							{
								type: "text",
								text: JSON.stringify(
									await worker().root(async (ctx) => {
										const rows = await expectVariant(await ctx.get(Schedules, {}), "worker").list({}, ctx);
										return rows.map((row) => ({
											...row,
											...(row.phase.kind === "active"
												? {
														nextUTC: new Date(row.phase.nextAt).toISOString(),
														nextLocal: new Intl.DateTimeFormat("en-CA", {
															timeZone: row.definition.timezone,
															dateStyle: "full",
															timeStyle: "long",
														}).format(row.phase.nextAt),
													}
												: {}),
										}));
									}, context),
								),
							},
						],
					}),
				}),
				defineP2Tool({
					name: "schedule_set_enabled",
					description:
						"Pause or resume a schedule using its current revision. Pause retires unattempted deliveries, not work already admitted. Resume starts in the future.",
					parameters: obj({ id: str(), expectedRevision: int(), enabled: bool() }),
					replay: "safe",
					callers: ["tools"],
					locked: "never",
					execute: async (args, _api, context) => ({
						output: [
							{
								type: "text",
								text: JSON.stringify(
									await worker().root(
										async (ctx) =>
											expectVariant(await ctx.get(Schedules, {}), "worker").setEnabled(args, ctx),
										context,
									),
								),
							},
						],
					}),
				}),
				defineP2Tool({
					name: "schedule_run",
					description:
						"Publish one manual run of an active schedule without changing its next occurrence. Retries of this tool call reuse one event ID.",
					parameters: obj({ id: str(), expectedRevision: int() }),
					replay: "safe",
					callers: ["tools"],
					locked: "never",
					execute: async ({ id, expectedRevision }, api, context) => ({
						output: [
							{
								type: "text",
								text: JSON.stringify(
									await worker().root(
										async (ctx) =>
											expectVariant(await ctx.get(Schedules, {}), "worker").run(
												{ id, expectedRevision, requestId: `${api.taskId}:${api.callId}` },
												ctx,
											),
										context,
									),
								),
							},
						],
					}),
				}),
				defineP2Tool({
					name: "schedule_receipt",
					description:
						"Read the latest pending/published occurrence's actual native admission and settlement. Recorded does not mean admitted or business success.",
					parameters: obj({ id: str() }),
					replay: "safe",
					callers: ["tools"],
					locked: "never",
					execute: async (args, _api, context) => ({
						output: [
							{
								type: "text",
								text: JSON.stringify(
									await worker().root(
										async (ctx) => expectVariant(await ctx.get(Schedules, {}), "worker").receipt(args, ctx),
										context,
									),
								),
							},
						],
					}),
				}),
			],
		});
		self.contribute(Extensions, { [extension.name]: extension });
	});
});
