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
  expect(tools.size).toBe(20);
  expect(tools.has("tea_maps_open_project_map")).toBe(false);
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

it("forwards invocation cancellation through validated document actions before deferred commits", async () => {
  const tools = new Map<string, WebMcpTool>();
  const view = new EventTarget();
  const document = {
    documentElement: { dataset: {} },
    defaultView: view,
    modelContext: {
      registerTool: async (tool: WebMcpTool) => {
        tools.set(tool.name, tool);
      },
    },
  } as unknown as Document;
  const map = createStarterDocument();
  const state = { session: { document: map } } as EditorState;
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const commit = vi.fn();
  const replaceMapSource: EditorActions["replaceMapSource"] = async (
    _source,
    _name,
    _id,
    _revision,
    signal,
  ) => {
    await waiting;
    signal.throwIfAborted();
    commit();
  };
  await registerEditorWebMcpTools(document, () => state, {
    replaceMapSource,
  } as unknown as EditorActions);
  const controller = new AbortController();
  const result = tools.get("tea_maps_replace_map_source")!.execute(
    {
      expectedDocumentId: map.id,
      expectedRevision: map.revision,
      source: "synthetic",
      confirmDestructive: true,
    },
    { signal: controller.signal },
  );
  controller.abort();
  finish();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(commit).not.toHaveBeenCalled();
});
