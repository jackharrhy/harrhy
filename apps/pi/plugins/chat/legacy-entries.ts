// Notes on entries written by plugins that were removed (the views and scope prompt plugins, and chat mode). Their
// messages are people's messages (the transcript shows their text by their data); these displays keep what else came
// along: a scope or views note, a reply's quoted line and a mention's count.
import type { EntryDisplay } from "./contract.ts";

/** The entry kind of a person's message that carried views context to the agent. */
export const VIEW_INPUT_ENTRY = "p2.view-input";
/** Chat mode's display-only messages and mentions. */
export const CHAT_MESSAGE_ENTRY = "chat.message";
export const CHAT_MENTION_ENTRY = "chat.mention";

const field = (data: unknown, key: string): unknown =>
	data !== null && typeof data === "object" && key in data ? (data as Record<string, unknown>)[key] : undefined;

/** The note on a `p2.view-input` entry: how many selections and annotations it carried, and other plugins' notes. */
export function viewInputDisplay(data: unknown): EntryDisplay | undefined {
	const views = field(data, "views");
	if (views === null || typeof views !== "object") return undefined;
	const count = (key: string) => {
		const value = field(views, key);
		return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
	};
	const selections = count("selections");
	const annotations = count("annotations");
	const notes = field(views, "notes");
	const parts = [
		selections ? `${selections} selection${selections === 1 ? "" : "s"}` : "",
		annotations ? `${annotations} annotation${annotations === 1 ? "" : "s"}` : "",
	].filter(Boolean);
	const others = Array.isArray(notes) ? notes.filter((note): note is string => typeof note === "string") : [];
	const said = [...(parts.length ? [`${parts.join(" and ")} from views`] : []), ...others];
	return said.length ? { note: `with ${said.join(", ")}` } : undefined;
}

/** A reply's quoted line, from the quote stored with it (`replyTo`: the entry, its author and the start of its text). */
function quoteOf(data: unknown): EntryDisplay | undefined {
	const replyTo = field(data, "replyTo");
	const author = field(replyTo, "author");
	const entryId = field(replyTo, "entryId");
	const excerpt = field(replyTo, "excerpt");
	const name = field(author, "name");
	if (!Number.isSafeInteger(entryId) || typeof excerpt !== "string" || typeof name !== "string") return undefined;
	return { replyTo: { entryId: entryId as number, name, excerpt } };
}

const plural = (count: number): string => (count === 1 ? "1 chat message" : `${count} chat messages`);

/** The displays of chat mode's entry kinds, kept for the transcripts written before it was removed. */
export const LEGACY_ENTRY_DISPLAYS: Record<string, (data: unknown) => EntryDisplay | undefined> = {
	[VIEW_INPUT_ENTRY]: viewInputDisplay,
	[CHAT_MESSAGE_ENTRY]: quoteOf,
	[CHAT_MENTION_ENTRY]: (data) => {
		const included = field(data, "included");
		const count = Array.isArray(included) ? included.length : 0;
		const quote = quoteOf(data);
		return { ...quote, ...(count ? { note: `with ${plural(count)}` } : {}) };
	},
};
