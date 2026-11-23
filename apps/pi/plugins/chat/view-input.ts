// Notes on messages sent before the views and scope prompt plugins were removed. Their entries are kind `p2.view-input`
// with the message data plus `views` (counts of selections and annotations, and other plugins' notes). The transcript
// still shows the person's text; this keeps the note of what came along.
import type { EntryDisplay } from "./contract.ts";

/** The entry kind of a person's message that carried views context to the agent (kept for old entries). */
export const VIEW_INPUT_ENTRY = "p2.view-input";

/** The note on a `p2.view-input` entry: how many selections and annotations it carried, and other plugins' notes. */
export function viewInputDisplay(data: unknown): EntryDisplay | undefined {
	const views = data !== null && typeof data === "object" && "views" in data ? data.views : undefined;
	if (views === null || typeof views !== "object") return undefined;
	const count = (key: string) => {
		const value = (views as Record<string, unknown>)[key];
		return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
	};
	const selections = count("selections");
	const annotations = count("annotations");
	const notes = (views as Record<string, unknown>).notes;
	const parts = [
		selections ? `${selections} selection${selections === 1 ? "" : "s"}` : "",
		annotations ? `${annotations} annotation${annotations === 1 ? "" : "s"}` : "",
	].filter(Boolean);
	const others = Array.isArray(notes) ? notes.filter((note): note is string => typeof note === "string") : [];
	const said = [...(parts.length ? [`${parts.join(" and ")} from views`] : []), ...others];
	return said.length ? { note: `with ${said.join(", ")}` } : undefined;
}
