// What the chat's parts (Chat.tsx and the activity in src/web/activity) get from where a transcript is shown:
// navigation, the session and its working directory. Chat.tsx re-exports them.
import { createContext } from "react";
import type { ToolActivityTable } from "./activity/model.ts";

/** How tools' calls show, by tool name (`ToolActivities`, contributed by the plugins that own them). */
export const ToolActivityContext = createContext<ToolActivityTable>(new Map());
/** Opens a subagent conversation of the current session. */
export const OpenConversation = createContext<(conversationId: number) => void>(() => {});
/** The session's one-shot agents: conversation by the nested call ID that ran them (`<script call ID>/c<n>`). */
export const OneShotAgents = createContext<ReadonlyMap<string, number>>(new Map());
/** Owner-only navigation to another session or an exact message there; absent for guest views. */
export const OpenPeerConversation = createContext<((sessionId: string, message?: { conversation: number; entryId: number }) => void) | undefined>(undefined);
/** Tool paths are displayed relative to the containing session's working directory. */
export const WorkingDirectory = createContext<string | undefined>(undefined);
/** Download locators are scoped to the containing session, including child views. */
export const SessionId = createContext<string | undefined>(undefined);
/**
 * Continues the session from a message (`/tree`, docs/tree.md): `from` before a user message, whose text goes back to
 * the composer ("Edit"), or after an answer ("Branch from here"). `end` is the conversation's last entry: an answer
 * there offers no Branch, as the session already continues after it (the composer sends in a new branch instead).
 * Absent unless the owner views the main conversation.
 */
export const BranchFrom = createContext<
	{ readonly from: (entryId: number) => void; readonly end: number | undefined } | undefined
>(undefined);
/** Loads older history until an entry is retained; false when the conversation has no such entry. */
export const RevealEntry = createContext<((entryId: number) => Promise<boolean>) | undefined>(undefined);

/** A path as the session sees it: relative to its working directory when inside it. */
export function relativePath(cwd: string | undefined, path: string): string {
	if (!cwd?.startsWith("/") || !path.startsWith("/")) return path;
	const from = cwd.split("/").filter(Boolean);
	const to = path.split("/").filter(Boolean);
	let shared = 0;
	while (shared < from.length && from[shared] === to[shared]) shared++;
	return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/") || ".";
}
