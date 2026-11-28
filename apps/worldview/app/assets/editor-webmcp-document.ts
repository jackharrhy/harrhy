import { z } from "zod";
import {
  assertDocument,
  destructive,
  expectedDocument,
  selection,
  tool,
  type EditorActions,
  type EditorState,
  type WebMcpTool,
} from "./editor-webmcp-contract.ts";

export function documentEditorWebMcpTools(
  state: () => EditorState,
  actions: EditorActions,
): readonly WebMcpTool[] {
  return [
    tool(
      z.strictObject({
        ...expectedDocument,
        source: z.string().min(1).max(16_000_000),
        name: z.string().trim().min(1).max(512).default("site-tool.map"),
        confirmDestructive: z.literal(true),
      }),
      {
        name: "tea_maps_replace_map_source",
        description:
          "Replace the current map from source as a detached local copy, resetting editor history and file binding. Requires explicit destructive confirmation.",
        annotations: destructive,
        async execute(input, { signal }) {
          assertDocument(state, input);
          await actions.replaceMapSource(
            input.source,
            input.name,
            input.expectedDocumentId,
            input.expectedRevision,
            signal,
          );
          const opened = state();
          actions.status(`replaced the document with ${input.name}`);
          return {
            documentId: opened.session.document.id,
            revision: opened.session.document.revision,
            name: opened.name,
            selection: selection(opened),
          };
        },
      },
    ),
  ];
}
