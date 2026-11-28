import {
  DocumentIdSchema,
  selectedBrushIds,
  selectedFaceReferences,
  selectedPointEntityIds,
  type EditorSession,
  type EditorMaterial,
  type MapSourceState,
} from "@harrhy/maps-editor/core";
import type { EditorSourceRenderer } from "@harrhy/maps-editor/render";
import type { HostedMapLaunch } from "@harrhy/maps-protocol";
import { z } from "zod";

export type JsonObject = Readonly<Record<string, unknown>>;

export type { WebMcpTool } from "@harrhy/webmcp";
import type { WebMcpTool } from "@harrhy/webmcp";

export interface EditorState {
  readonly session: EditorSession;
  readonly name: string;
  readonly workingSource: string;
  readonly sourceState: MapSourceState;
  readonly dirty: boolean;
  readonly hostedMap: HostedMapLaunch | null;
  readonly renderer: EditorSourceRenderer | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly materials: readonly EditorMaterial[];
  readonly activeTool: string;
}

export interface EditorActions {
  prepareEdit(): void;
  history(action: "undo" | "redo", signal: AbortSignal): Promise<void>;
  replaceMapSource(
    source: string,
    name: string,
    expectedDocumentId: string,
    expectedRevision: number,
    signal: AbortSignal,
  ): Promise<void>;
  setTool(tool: string): void;
  status(message: string): void;
}

export const pagination = {
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(50),
};
const readOnly = {
  readOnlyHint: true,
} as const;
export const changesView = {
  readOnlyHint: false,
  consequentialHint: false,
} as const;
export const destructive = { ...changesView, consequentialHint: true } as const;
export const expectedDocument = {
  expectedDocumentId: DocumentIdSchema,
  expectedRevision: z.number().int().nonnegative(),
};
export const axis = z.enum(["x", "y", "z"]);

export function axisIndex(value: "x" | "y" | "z"): 0 | 1 | 2 {
  return value === "x" ? 0 : value === "y" ? 1 : 2;
}

export function tool<Schema extends z.ZodType>(
  schema: Schema,
  definition: {
    readonly name: string;
    readonly description: string;
    readonly annotations?: WebMcpTool["annotations"];
    execute(
      input: z.output<Schema>,
      context: { readonly signal: AbortSignal },
    ): JsonObject | Promise<JsonObject>;
  },
): WebMcpTool {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: z.toJSONSchema(schema) as JsonObject,
    annotations: definition.annotations ?? readOnly,
    execute(input, context) {
      context.signal.throwIfAborted();
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!;
        const path = issue.path.length ? ` at ${issue.path.join(".")}` : "";
        throw new Error(`Tool input is invalid${path}: ${issue.message}`);
      }
      return definition.execute(parsed.data, context);
    },
  };
}

export function selection(state: EditorState) {
  const value = state.session.selection;
  return {
    kind: !value ? "none" : value.faceId ? "faces" : "objects",
    brushIds: selectedBrushIds(value),
    entityIds: selectedPointEntityIds(value),
    faces: selectedFaceReferences(value),
    groupId: value?.groupId ?? null,
  };
}

export function assertDocument(
  state: () => EditorState,
  input: { expectedDocumentId: string; expectedRevision: number },
): EditorState {
  const current = state();
  const document = current.session.document;
  if (document.id !== input.expectedDocumentId)
    throw new Error(`Stale document identity: current ID is ${document.id}`);
  if (document.revision !== input.expectedRevision)
    throw new Error(
      `Stale document revision: current revision is ${document.revision}`,
    );
  return current;
}
