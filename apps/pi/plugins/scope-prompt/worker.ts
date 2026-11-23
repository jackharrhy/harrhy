// The scope prompt (worker): scope blocks staged by the page for a message about to be sent here (`ScopeStage`), carried
// with that message by this plugin's send router (matched by its `requestId`) and dropped once carried. A staged block
// whose message never comes is dropped after a minute.
import { canSend, contribute, defineFacet, forbidden, type MessageData } from "@p2/app/v1";
import { Conversation, SendRouters } from "../chat/contract.ts";
import { Attachments, MAX_ATTACHMENTS } from "../files/contract.ts";
import { ScopeStage } from "./contract.ts";
import { SCOPE_INPUT } from "./display.ts";

/** How long a staged block waits for its message. */
const STAGED_FOR = 60_000;

type Staged = { readonly block: string; readonly note: string; readonly timer: ReturnType<typeof setTimeout> };

export default defineFacet((host) => {
	// This worker's staged blocks by request ID (a worker serves one session).
	const staged = new Map<string, Staged>();
	const drop = (requestId: string) => {
		clearTimeout(staged.get(requestId)?.timer);
		staged.delete(requestId);
	};

	host.serve(ScopeStage, ({ session }, principal) => {
		if (!canSend(principal, session)) throw forbidden("only people who may send here stage a scope");
		return {
			variant: "sender",
			members: {
				stage: async ({ requestId, block, note }) => {
					drop(requestId);
					staged.set(requestId, { block, note, timer: setTimeout(() => staged.delete(requestId), STAGED_FOR) });
					return null;
				},
			},
		};
	});

	contribute(host, "p2.scope-prompt-context", (self) => {
		// A message with a staged scope carries its block after its text (the model's copy only: the transcript shows what
		// the person wrote, and a note). Others go on to the next router, or become plain inputs.
		self.contribute(SendRouters, {
			"scope-prompt": async (input, ctx) => {
				const { conversation, author, text, requestId, whenBusy, attachments } = input;
				const scope = staged.get(requestId);
				if (!scope) return undefined;
				const files = [];
				if (attachments.length) {
					const store = await ctx.get(Attachments, {});
					for (let start = 0; start < attachments.length; start += MAX_ATTACHMENTS)
						files.push(
							...(await store.resolve({ ids: attachments.slice(start, start + MAX_ATTACHMENTS), conversation }, ctx)),
						);
				}
				const data: MessageData & { views: { notes: string[] } } = {
					author,
					text,
					attachments: files.map(({ id, name }) => ({ id, name })),
					views: { notes: [scope.note] },
				};
				const chat = await ctx.get(Conversation, { conversation });
				const submitted = await chat.submit(
					{
						text: text.trim() ? `${text}\n\n${scope.block}` : scope.block,
						requestId,
						author,
						files,
						entry: { kind: SCOPE_INPUT, data },
						...(whenBusy ? { whenBusy } : {}),
					},
					ctx,
				);
				drop(requestId);
				return submitted;
			},
		});
	});
});
