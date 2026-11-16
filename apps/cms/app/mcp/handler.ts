import {
  bindTool,
  createNativeHandler,
  defineTool,
  Server,
  type CallToolResult,
} from "@harrhy/mcp";
import * as s from "@harrhy/json-schema";
import { maxLength } from "@harrhy/json-schema/checks";
import type { ContentStore } from "../data/content.ts";

const listPages = defineTool({
  name: "list_published_pages",
  description:
    "List published pages for this TeaCMS site. Draft content is never returned.",
  input: s.object({}, { unknownKeys: "error" }),
  annotations: { readOnlyHint: true, openWorldHint: false },
});
const getPage = defineTool({
  name: "get_published_page",
  description:
    "Read a published page and its content blocks by slug. Use an empty slug for the homepage. Draft content is never returned.",
  input: s.object(
    { slug: s.string().pipe(maxLength(200)) },
    { unknownKeys: "error" },
  ),
  annotations: { readOnlyHint: true, openWorldHint: false },
});
const toolsResult = { tools: [listPages.descriptor, getPage.descriptor] };

function failure(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}
const invalidArguments = () => failure("Unknown tool or invalid arguments.");
const validation = {
  invalidInput: invalidArguments,
  invalidOutput: invalidArguments,
};
function textResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

export function createMcpHandler(store: ContentStore) {
  const list = bindTool(
    listPages,
    () =>
      textResult(
        [store.homepage(), ...store.pages()].map(({ slug, title, seo }) => ({
          slug,
          title,
          seo,
        })),
      ),
    validation,
  );
  const get = bindTool(
    getPage,
    ({ slug }) => {
      const page = slug === "" ? store.homepage() : store.page(slug);
      return page
        ? textResult(page)
        : failure("No published page has that slug.");
    },
    validation,
  );
  return createNativeHandler(
    () => {
      const server = new Server(
        { name: "teacms", title: "TeaCMS", version: "1.0.0" },
        {
          capabilities: { tools: { listChanged: false } },
          instructions:
            "Use list_published_pages to discover pages, then get_published_page to read one. Only published content is available.",
        },
      );
      server.setRequestHandler("tools/list", () => toolsResult);
      server.setRequestHandler("tools/call", async (message) => {
        const { name, arguments: input = {} } = message.params;
        const result =
          name === listPages.descriptor.name
            ? await list(input)
            : name === getPage.descriptor.name
              ? await get(input)
              : invalidArguments();
        return server.projectCallToolResult(result, undefined);
      });
      return server;
    },
    { maxRequestBytes: 64 * 1024 },
  );
}
