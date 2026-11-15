import { expect, it, vi } from "vitest";
import { createStarterDocument } from "@harrhy/maps-editor/core";
import type { WebMcpTool } from "@harrhy/webmcp";
import type { EditorActions, EditorState } from "../editor-webmcp-contract.ts";
import { registerEditorWebMcpTools } from "../editor-webmcp.ts";

it("registers the existing catalog and keeps schema, identity, revision, and confirmation guards before actions", async () => {
  const tools = new Map<string, WebMcpTool>();
  const dataset: Record<string, string> = {};
  const document = {
    documentElement: { dataset },
    defaultView: new EventTarget(),
    modelContext: {
      registerTool: async (tool: WebMcpTool) => {
        tools.set(tool.name, tool);
      },
    },
  } as unknown as Document;
  const map = createStarterDocument();
  const state = { session: { document: map } } as EditorState;
  const replaceMapSource = vi.fn();
  await registerEditorWebMcpTools(document, () => state, {
    replaceMapSource,
  } as unknown as EditorActions);
  expect(dataset.teaMapsSiteTools).toBe("ready");
  expect(tools.size).toBe(21);
  const replace = tools.get("tea_maps_replace_map_source")!;
  expect(replace.annotations).toEqual({
    readOnlyHint: false,
    consequentialHint: true,
  });
  const context = { signal: new AbortController().signal };
  const input = {
    expectedDocumentId: map.id,
    expectedRevision: map.revision,
    source: "synthetic",
    confirmDestructive: true,
  };
  expect(() =>
    replace.execute({ ...input, confirmDestructive: false }, context),
  ).toThrow(/invalid/);
  await expect(
    replace.execute(
      { ...input, expectedDocumentId: "another-document" },
      context,
    ),
  ).rejects.toThrow(/Stale document identity/);
  await expect(
    replace.execute({ ...input, expectedRevision: map.revision + 1 }, context),
  ).rejects.toThrow(/Stale document revision/);
  expect(replaceMapSource).not.toHaveBeenCalled();
});
