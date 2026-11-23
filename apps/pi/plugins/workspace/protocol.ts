import type { Static } from "@earendil-works/pi-schema";
import type { QuerySchema } from "./contract.ts";

// Read-only listings of a conversation's working directory,
// always resolved inside that conversation's execution environment by its worker.
/** The type of the contract's schema (contract.ts). */
export type WorkspaceQuery = Static<typeof QuerySchema>;
export type WorkspaceEntry = {
	name: string;
	kind: "file" | "directory" | "symlink";
	size: number;
	mtimeMs: number;
};
export type WorkspaceResult =
	| { kind: "list"; path: string; entries: WorkspaceEntry[]; truncated: boolean }
	| { kind: "files"; paths: string[]; truncated: boolean };

export { workspacePath } from "./contract.ts";
