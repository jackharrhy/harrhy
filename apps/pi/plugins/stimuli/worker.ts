// Transactional native follow-up admission; receipts remain owned by the session worker.
import { type ConversationId, defineDoc, defineExtension, type SubmissionId } from "@earendil-works/pi-durable";
import { obj, type Static, str } from "@earendil-works/pi-schema";
import {
	type Ctx,
	defineFacet,
	expectVariant,
	forbidden,
	local,
	PEER_MESSAGE_ENTRY,
	type PeerMessage,
	senderText,
} from "@p2/app/v1";
import {
	defineP2Tool,
	Extensions,
	harnessOf,
	InputGates,
	mainConversation,
	type P2Tool,
	ReadOnlyConversations,
	workerOf,
} from "@p2/app/v1/worker";
import {
	Admission,
	type DeliveryReceiptSchema,
	type DeliverySchema,
	type LegacyReceiptSchema,
	type SourceDeliverySchema,
	type SourceProvenanceSchema,
	StimulusWorker,
	Wakes,
} from "./contract.ts";

type LegacyReceipt = Static<typeof LegacyReceiptSchema>;
type Receipt = Static<typeof DeliveryReceiptSchema>;
const LegacyReceipts = defineDoc<{ events: Record<string, LegacyReceipt> }>({
	kind: "p2.ingress-receipts",
	version: 1,
	scope: "session",
	initial: () => ({ events: {} }),
	checkpointWhen: (_value, _ops, info) => info.deltasSinceBase >= 100,
});
const Receipts = defineDoc<{ events: Record<string, Receipt> }>({
	kind: "p2.stimulus-receipts",
	version: 1,
	scope: "session",
	initial: () => ({ events: {} }),
	checkpointWhen: (_value, _ops, info) => info.deltasSinceBase >= 100,
});

const WakeTools = local("p2.wake-tools", { version: 1, params: {}, members: {} });

export default defineFacet((host) => {
	host.serve(WakeTools, (_params, self) => {
		const worker = workerOf(self);
		const readOnlyConversations = self.registry(ReadOnlyConversations);
		const extension = defineExtension<P2Tool>({
			name: "p2-wakes",
			tools: [
				defineP2Tool({
					name: "wake_at",
					description:
						"Wake this conversation once at a future timestamp with an explicit offset. Saved across server restarts; no model runs while waiting. Private sessions only.",
					parameters: obj({ at: str(), text: str({ minLength: 1, maxLength: 32768 }) }),
					replay: "safe",
					locked: "never",
					execute: async (args, api, context) => {
						await worker().root(async (ctx) => {
							for (const readOnly of readOnlyConversations.value.values()) {
								const reason = await readOnly(api.conversationId, ctx);
								if (reason) throw forbidden(reason);
							}
						}, context);
						return {
							output: [
								{
									type: "text",
									text: JSON.stringify(
										await worker().root(
											async (ctx) =>
												expectVariant(await ctx.get(Wakes, {}), "worker").register(
													{
														...args,
														conversation: api.conversationId,
														requestId: `${api.taskId}:${api.callId}`,
													},
													ctx,
												),
											context,
										),
									),
								},
							],
						};
					},
				}),
				defineP2Tool({
					name: "wake_list",
					description: "List this session's saved wakes and actual admission/settlement states.",
					parameters: obj({}),
					replay: "safe",
					locked: "never",
					execute: async (_args, _api, context) => ({
						output: [
							{
								type: "text",
								text: JSON.stringify(
									await worker().root(
										async (ctx) => expectVariant(await ctx.get(Wakes, {}), "worker").list({}, ctx),
										context,
									),
								),
							},
						],
					}),
				}),
				defineP2Tool({
					name: "wake_cancel",
					description:
						"Stop future attempts for a wake ID. Does not undo admitted input; uncertain admissions remain visible for readback.",
					parameters: obj({ id: str() }),
					replay: "safe",
					locked: "never",
					execute: async (args, _api, context) => ({
						output: [
							{
								type: "text",
								text: JSON.stringify(
									await worker().root(
										async (ctx) => expectVariant(await ctx.get(Wakes, {}), "worker").cancel(args, ctx),
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
		return {};
	});
	host.serve(
		Admission,
		(_params, self) => {
			const harness = harnessOf(self);
			const worker = workerOf(self);
			const gates = self.registry(InputGates);
			const readOnlyConversations = self.registry(ReadOnlyConversations);
			const admit = (
				delivery: Static<typeof DeliverySchema>,
				provenance: Static<typeof SourceDeliverySchema> | undefined,
				ctx: Ctx,
			) =>
				worker().liveness.call(async () => {
					if (delivery.session !== worker().init.values.session.id) throw forbidden("Wrong delivery target");
					const durable = harness().durable;
					const previous = (await durable.snapshot(Receipts, ctx))?.events[delivery.id];
					if (previous)
						return previous.intentHash === delivery.intentHash ? previous : { state: "conflict" as const };
					for (const gate of gates.value.values()) await gate(ctx);
					for (const readOnly of readOnlyConversations.value.values()) {
						const reason = await readOnly(delivery.conversation, ctx);
						if (reason) throw forbidden(reason);
					}
					// The schema-checked wire number is a Durable conversation identifier.
					const conversation = await durable.conversation(delivery.conversation as ConversationId, ctx);
					if (!conversation) throw new Error("No target conversation");
					const conflict = await durable.commit(async (tx) => {
						const doc = await tx.doc(Receipts);
						const saved = doc.events[delivery.id];
						if (saved) return saved.intentHash !== delivery.intentHash;
						const submissionId = await conversation.submit(tx, {
							type: "input",
							requestId: `stimulus:${delivery.id}`,
							whenBusy: "followUp",
							...message(
								provenance?.source.id ?? "scheduled-stimulus",
								provenance?.source.label ?? "Scheduled wake",
								delivery.text,
								provenance,
							),
						});
						doc.events[delivery.id] = {
							state: "admitted",
							deliveryId: delivery.id,
							intentHash: delivery.intentHash,
							conversation: delivery.conversation,
							submissionId,
						};
						return false;
					}, ctx);
					if (conflict) return { state: "conflict" as const };
					return (await durable.snapshot(Receipts, ctx))!.events[delivery.id]!;
				});

			return {
				admit: (delivery, ctx) => admit(delivery, undefined, ctx),
				admitSource: (envelope, ctx) => admit(envelope.delivery, envelope, ctx),
				validateTarget: (args, ctx) =>
					worker().liveness.call(async () => {
						for (const readOnly of readOnlyConversations.value.values()) {
							const reason = await readOnly(args.conversation, ctx);
							if (reason) throw forbidden(reason);
						}
						// Schema-checked wire numbers are Durable conversation identifiers.
						if (!(await harness().durable.conversation(args.conversation as ConversationId, ctx)))
							throw new Error("No target conversation");
						return null;
					}),
				legacyAdmit: (args, ctx) =>
					worker().liveness.call(async () => {
						const durable = harness().durable;
						const key = JSON.stringify([args.sender, args.eventId]);
						const previous = (await durable.snapshot(LegacyReceipts, ctx))?.events[key];
						if (previous)
							return previous.contentHash === args.contentHash ? previous : { state: "conflict" as const };
						for (const gate of gates.value.values()) await gate(ctx);
						const main = await durable.conversation(await mainConversation(durable, ctx), ctx);
						if (!main) throw new Error("No main conversation");
						const conflict = await durable.commit(async (tx) => {
							const doc = await tx.doc(LegacyReceipts);
							const saved = doc.events[key];
							if (saved) return saved.contentHash !== args.contentHash;
							const submissionId = await main.submit(tx, {
								type: "input",
								requestId: `ingress:${key}`,
								whenBusy: "followUp",
								...message(args.sender, args.name, args.text),
							});
							doc.events[key] = {
								state: "admitted",
								eventId: args.eventId,
								contentHash: args.contentHash,
								submissionId,
							};
							return false;
						}, ctx);
						if (conflict) return { state: "conflict" as const };
						return (await durable.snapshot(LegacyReceipts, ctx))!.events[key]!;
					}),
				legacyReceipt: ({ sender, eventId }, ctx) =>
					worker().liveness.call(
						async () =>
							(await harness().durable.snapshot(LegacyReceipts, ctx))?.events[
								JSON.stringify([sender, eventId])
							] ?? null,
					),

				status: ({ id, intentHash }, ctx) =>
					worker().liveness.call(async () => {
						const receipt = (await harness().durable.snapshot(Receipts, ctx))?.events[id];
						if (!receipt) return { state: "missing" as const };
						if (receipt.intentHash !== intentHash) return { state: "conflict" as const };
						// The persisted receipt holds the native identifier returned by submit.
						const submission = await harness().durable.submission(receipt.submissionId as SubmissionId, ctx);
						if (!submission) throw new Error("Admission receipt has no native submission");
						return { state: (await submission.status(ctx)).status, receipt };
					}),
			};
		},
		{ accepts: { 1: {} } },
	);
	host.serve(
		StimulusWorker,
		(_params, principal, self) => {
			if (principal.kind !== "server") throw forbidden("Server stimuli only");
			const admission = self.get(Admission, {});
			return {
				variant: "server",
				members: {
					admit: (args, ctx) => admission.admit(args, ctx),
					admitSource: (args, ctx) => admission.admitSource(args, ctx),
					validateTarget: (args, ctx) => admission.validateTarget(args, ctx),
					status: (args, ctx) => admission.status(args, ctx),
				},
			};
		},
		{ accepts: { 1: {} } },
	);
});

function message(id: string, name: string, text: string, source?: Static<typeof SourceDeliverySchema>) {
	return {
		content: [
			{ type: "text" as const, text: senderText({ kind: "external", id, name }) },
			{ type: "text" as const, text },
		],
		entry: {
			kind: PEER_MESSAGE_ENTRY,
			data: {
				from: { kind: "external", id, title: name },
				text,
				...(source
					? {
							stimulus: {
								deliveryId: source.delivery.id,
								sourceVersion: source.source.version,
								subscriptionId: source.subscriptionId,
								revision: source.revision,
								eventId: source.eventId,
							} satisfies Static<typeof SourceProvenanceSchema>,
						}
					: {}),
			} satisfies PeerMessage,
		},
	};
}
