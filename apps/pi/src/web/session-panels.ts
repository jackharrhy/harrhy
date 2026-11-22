// The right-hand panel each session had open on this device (the side panel), so a
// session opens with its own panels instead of the ones the previous session had open.
import type { Route } from "./navigation.ts";

/** The parts of a route that are a session's panels. */
export type SessionPanels = Pick<Route, "panel" | "activity">;

/** What is kept of a session's panels: the conversation they were open in decides whether an activity still applies. */
type Kept = SessionPanels & { conversation: number };

const STORAGE = "p2-session-panels";
/** Sessions remembered per device; the least recently changed are forgotten first. */
const LIMIT = 200;

/**
 * Remembers the panels `route` shows as its session's; a session with none open is forgotten. Called on every route
 * change, so the memory is current when the reader leaves the session or the page.
 */
export function rememberPanels(route: Route): void {
	if (!route.session) return;
	const kept = panelsOf(route, route.conversation, route.conversation);
	const entries = read();
	const at = entries.findIndex(([session]) => session === route.session);
	const open = Object.keys(kept).length > 0;
	if (!open && at < 0) return;
	const next: Kept = { ...kept, conversation: route.conversation };
	if (open && at >= 0 && JSON.stringify(entries[at]?.[1]) === JSON.stringify(next)) return;
	if (at >= 0) entries.splice(at, 1);
	if (open) entries.push([route.session, next]);
	write(entries.slice(-LIMIT));
}

/**
 * The panels `conversation` of `session` opens with: within the open session, the ones open now; another session's
 * as it last had them on this device (none if it never had any). Restoring never covers the chat: on phones, where
 * the side panel takes the screen, nothing is restored over the chat.
 */
export function panelsFor(current: Route, session: string, conversation: number): SessionPanels {
	if (session === current.session) return panelsOf(current, conversation, current.conversation);
	const kept = read().find(([each]) => each === session)?.[1];
	if (!kept) return {};
	const { panel, activity } = panelsOf(kept, conversation, kept.conversation);
	return {
		...(window.matchMedia(SIDE_PANEL_DOCKS).matches ? { panel, activity } : {}),
	};
}

/** Where the side panel docks beside the chat instead of being a sheet (SidePanel.tsx). */
const SIDE_PANEL_DOCKS = "(min-width: 700px)";

/**
 * The panels of `from` (open in conversation `shown`) as `conversation` shows them: the same plugin panel, and a
 * transcript block's activity only in its own conversation.
 */
function panelsOf(from: SessionPanels, conversation: number, shown: number): SessionPanels {
	const { panel, activity } = from;
	return {
		...(panel !== undefined ? { panel } : {}),
		...(activity && conversation === shown ? { activity } : {}),
	};
}

// The stored list is device data any version of the page may have written: entries and fields that are not as this
// version expects are dropped, not trusted.
function read(): [string, Kept][] {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
		if (!Array.isArray(value)) return [];
		return value.flatMap((entry): [string, Kept][] => {
			if (!Array.isArray(entry) || typeof entry[0] !== "string") return [];
			const kept = keptOf(entry[1]);
			return kept ? [[entry[0], kept]] : [];
		});
	} catch {
		return [];
	}
}

/** A stored entry's panels, each field kept only when it has this version's shape. */
function keptOf(value: unknown): Kept | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { conversation, panel, activity } = value as Record<string, unknown>;
	if (typeof conversation !== "number") return undefined;
	const row = (activity as { row?: unknown } | null | undefined)?.row;
	const step = (activity as { step?: unknown } | null | undefined)?.step;
	return {
		conversation,
		...(typeof panel === "string" ? { panel } : {}),
		...(typeof row === "string" ? { activity: { row, ...(typeof step === "string" ? { step } : {}) } } : {}),
	};
}

function write(entries: [string, Kept][]): void {
	try {
		localStorage.setItem(STORAGE, JSON.stringify(entries));
	} catch {}
}
