import {
  createNativeHandler,
  Server,
  specTypeSchemas,
} from "@harrhy/mcp/native";
import type { ContentStore } from "../data/content.ts";

const catalog = specTypeSchemas.ListToolsResult["~standard"].validate({
  tools: [
    {
      name: "list_published_pages",
      description:
        "List published pages for this TeaCMS site. Draft content is never returned.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: "get_published_page",
      description:
        "Read a published page and its content blocks by slug. Use an empty slug for the homepage. Draft content is never returned.",
      inputSchema: {
        type: "object",
        properties: { slug: { type: "string", maxLength: 200 } },
        required: ["slug"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
  ],
});
if (catalog.issues) throw new Error("Invalid TeaCMS MCP catalog");
const toolsResult = catalog.value;

export function createMcpHandler(store: ContentStore) {
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
      server.setRequestHandler("tools/call", (message) => {
        const { name, arguments: input = {} } = message.params;
        let value: unknown;
        if (
          name === "list_published_pages" &&
          Object.keys(input).length === 0
        ) {
          value = [store.homepage(), ...store.pages()].map(
            ({ slug, title, seo }) => ({ slug, title, seo }),
          );
        } else if (
          name === "get_published_page" &&
          Object.keys(input).length === 1 &&
          typeof input.slug === "string" &&
          input.slug.length <= 200
        ) {
          value = input.slug === "" ? store.homepage() : store.page(input.slug);
          if (!value)
            return {
              isError: true,
              content: [
                { type: "text", text: "No published page has that slug." },
              ],
            };
        } else {
          return {
            isError: true,
            content: [
              { type: "text", text: "Unknown tool or invalid arguments." },
            ],
          };
        }
        return server.projectCallToolResult(
          { content: [{ type: "text", text: JSON.stringify(value) }] },
          undefined,
        );
      });
      return server;
    },
    { maxRequestBytes: 64 * 1024 },
  );
}
