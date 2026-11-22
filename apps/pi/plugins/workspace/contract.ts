import { num, obj, str, union, unknown } from "@earendil-works/pi-schema";
import { literal, local, method, param, unsafe } from "@p2/app/v1";
import type { WorkspaceResult } from "./protocol.ts";

const Path = str({ maxLength: 4096 });
export const QuerySchema = union([
	obj({ kind: literal("list"), path: Path }),
	/** Every file path below the root, for filtering by name: tracked and untracked, without ignored ones. */
	obj({ kind: literal("files") }),
]);
const Result = unsafe<WorkspaceResult>(unknown());

/**
 * A conversation's working directory as its worker reads it (at the conversation's location), with a watch on it.
 * Worker-internal: the file index is its only reader.
 */
export const WorkspaceBackend = local("p2.workspace-backend", {
	version: 1,
	params: { conversation: param.int({ min: 1 }) },
	members: {
		changes: num(),
		query: method(QuerySchema, Result),
	},
});

/**
 * A request path relative to the workspace root, as POSIX segments: `""` is the root.
 * Rejects absolute paths, `.`/`..`/empty segments, NUL, backslashes, `~` prefixes and
 * anything inside `.git` (repository config can hold credentials). Lexical only;
 * the worker additionally confines canonical paths.
 */
export function workspacePath(value: unknown): string | undefined {
	if (typeof value !== "string" || value.length > 4096) return undefined;
	if (value === "") return "";
	if (value.includes("\0") || value.includes("\\") || value.startsWith("/") || value.startsWith("~")) return undefined;
	const segments = value.split("/");
	if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
	if (segments[0] === ".git") return undefined;
	return value;
}
