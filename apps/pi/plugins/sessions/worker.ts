import { type ConversationId, type EntryDraft, type EntryId, ROOT_CONVERSATION_ID } from "@earendil-works/pi-durable";
import { defineFacet, forbidden } from "@p2/app/v1";
import { harnessOf, isTopLevel, workerOf } from "@p2/app/v1/worker";
import { serveActivity } from "./activity-worker.ts";
import { SessionTransfer } from "./contract.ts";
import { serveLockMirror } from "./lock-worker.ts";

export default defineFacet((host) => {
	serveLockMirror(host);
	serveActivity(host);
	// `Sessions.fork`: the server reads a conversation's active context here and seeds the new session's worker.
	host.serve(SessionTransfer, (_params, principal, self) => {
		if (principal.kind !== "server") throw forbidden("server only");
		const harness = harnessOf(self);
		const worker = workerOf(self);
		return {
			variant: "server",
			members: {
				history: async ({ conversation, before }, ctx) => {
					const durable = harness().durable;
					// A subagent's history as a session of its own needs its cwd and tools: not yet.
					if (!(await isTopLevel(durable, conversation as ConversationId, ctx)))
						throw new Error("Forking a subagent conversation is not supported yet");
					const found = await durable.conversation(conversation as ConversationId, ctx);
					if (!found) throw new Error(`Unknown conversation ${conversation}`);
					const [chosen] = (await found.entries({ maxEntryId: before as EntryId }, 1, undefined, ctx)).items;
					if (chosen?.id !== before) throw new Error("Unknown message");
					// The fork holds what came before the chosen message, as the context stood at the entry before it.
					const [previous] = (await found.entries({ maxEntryId: (before - 1) as EntryId }, 1, undefined, ctx))
						.items;
					if (!previous) return { entries: [] };
					const view = await found.context(ctx, { at: previous.id });
					// Edits are applied in `contributions` (their targets' IDs change); a head marker starts the copy's context.
					const entries: EntryDraft[] = view.entries.map((entry, index) => {
						const model = view.contributions[index] ?? [];
						return {
							kind: entry.kind,
							...(entry.data === undefined ? {} : { data: entry.data }),
							...(model.length ? { model: [...model] } : {}),
							...(index === 0 && view.head ? { head: "self" as const } : {}),
						};
					});
					return { entries };
				},
				copyFiles: async ({ to }, ctx) => {
					await worker().copyFilesTo(to, ctx);
					return null;
				},
				seed: async ({ entries }, ctx) => {
					const durable = harness().durable;
					const root = await durable.conversation(ROOT_CONVERSATION_ID, ctx);
					if (!root) throw new Error("No main conversation");
					if ((await root.entries({}, 1, undefined, ctx)).items.length)
						throw new Error("The session has history already");
					await durable.commit(async (tx) => {
						for (const entry of entries) await tx.appendEntry(ROOT_CONVERSATION_ID, entry as EntryDraft);
					}, ctx);
					return null;
				},
			},
		};
	});
});
