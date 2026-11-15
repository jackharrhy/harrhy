import { registerWebMcpTools } from "@harrhy/webmcp";
import { editEditorWebMcpTools } from "./editor-webmcp-edit.ts";
import { readEditorWebMcpTools } from "./editor-webmcp-read.ts";
import { documentEditorWebMcpTools } from "./editor-webmcp-document.ts";
import type {
  EditorActions,
  EditorState,
  WebMcpTool,
} from "./editor-webmcp-contract.ts";

function editorWebMcpTools(
  state: () => EditorState,
  actions: EditorActions,
): readonly WebMcpTool[] {
  return [
    ...readEditorWebMcpTools(state),
    ...editEditorWebMcpTools(state, actions),
    ...documentEditorWebMcpTools(state, actions),
  ];
}

export async function registerEditorWebMcpTools(
  document: Document,
  state: () => EditorState,
  actions: EditorActions,
): Promise<void> {
  const root = document.documentElement;
  const tools = editorWebMcpTools(state, actions);
  const registration = registerWebMcpTools(document, tools);
  if (!registration.supported) {
    root.dataset.teaMapsSiteTools = "unsupported";
    return;
  }
  try {
    await registration.ready;
    root.dataset.teaMapsSiteToolCount = String(tools.length);
    root.dataset.teaMapsSiteTools = "ready";
  } catch {
    root.dataset.teaMapsSiteToolCount = "0";
    root.dataset.teaMapsSiteTools = "error";
  }
}
