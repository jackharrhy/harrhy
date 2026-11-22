// The agent's side of peers: tools to see the linked Pi instances, what they let this one reach, and to send them a message.
import { createHash } from "node:crypto";
import { defineExtension } from "@earendil-works/pi-durable";
import { obj, opt, str } from "@earendil-works/pi-schema";
import { defineFacet, expectVariant, forbidden, local } from "@p2/app/v1";
import {
	defineP2Tool,
	Extensions,
	type P2Tool,
	ReadOnlyConversations,
	workerOf,
} from "@p2/app/v1/worker";
import { PeersWorker } from "./contract.ts";

const Tools = local("p2.peers-tools", { version: 1, params: {}, members: {} });
const text = (value: unknown) => ({
	output: [{ type: "text" as const, text: JSON.stringify(value) }],
});

export default defineFacet((host) => {
	host.serve(Tools, (_params, self) => {
		const worker = workerOf(self);
		const readOnlyConversations = self.registry(ReadOnlyConversations);
		const extension = defineExtension<P2Tool>({
			name: "p2-peers",
			tools: [
				defineP2Tool({
					name: "peer_list",
					description:
						"List the other Pi instances this one is linked to (linked by the owner in Settings › Peers), and whether each is reachable now.",
					parameters: obj({}),
					replay: "safe",
					locked: "never",
					execute: async (_args, _api, context) =>
						text(
							await worker().root(
								async (ctx) =>
									expectVariant(await ctx.get(PeersWorker, {}), "worker").list(
										{},
										ctx,
									),
								context,
							),
						),
				}),
				defineP2Tool({
					name: "peer_targets",
					description:
						"List the sessions on a linked peer that it lets this Pi message (the peer's owner chooses them). `peer` is its name or ID from peer_list.",
					parameters: obj({ peer: str() }),
					replay: "safe",
					locked: "never",
					execute: async (args, _api, context) =>
						text(
							await worker().root(
								async (ctx) =>
									expectVariant(
										await ctx.get(PeersWorker, {}),
										"worker",
									).targets(args, ctx),
								context,
							),
						),
				}),
				defineP2Tool({
					name: "peer_send",
					description:
						"Send a message to a linked peer Pi, to its default session or to one of peer_targets. It arrives there as input from this Pi, labelled as external; a person or agent there decides what to do with it, and any reply comes back as a message to this Pi, not as the result of this call. Send nothing secret. Returns the event ID and the delivery state (recorded, unknown or admitted: admitted means the peer's session took the input, not that it answered).",
					parameters: obj({
						peer: str(),
						text: str({ minLength: 1, maxLength: 32768 }),
						session: opt(str()),
					}),
					replay: "safe",
					locked: "never",
					execute: async (args, api, context) => {
						await worker().root(async (ctx) => {
							for (const readOnly of readOnlyConversations.value.values()) {
								const reason = await readOnly(api.conversationId, ctx);
								if (reason) throw forbidden(reason);
							}
						}, context);
						// The same call replayed after a restart is the same event: the peer recognizes its ID.
						const eventId = `peer-${createHash("sha256").update(`${api.taskId}:${api.callId}`).digest("hex").slice(0, 32)}`;
						return text(
							await worker().root(
								async (ctx) =>
									expectVariant(await ctx.get(PeersWorker, {}), "worker").send(
										{ ...args, eventId },
										ctx,
									),
								context,
							),
						);
					},
				}),
				defineP2Tool({
					name: "peer_receipt",
					description:
						"Read the delivery state of a message sent to a peer, by the event ID peer_send returned.",
					parameters: obj({ peer: str(), eventId: str() }),
					replay: "safe",
					locked: "never",
					execute: async (args, _api, context) =>
						text(
							await worker().root(
								async (ctx) =>
									expectVariant(
										await ctx.get(PeersWorker, {}),
										"worker",
									).receipt(args, ctx),
								context,
							),
						),
				}),
			],
		});
		self.contribute(Extensions, { [extension.name]: extension });
		return {};
	});
});
