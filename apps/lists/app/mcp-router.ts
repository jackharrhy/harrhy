import { IdentityError } from "@harrhy/identity";
import {
  createNativeHandler,
  Server,
  specTypeSchemas,
} from "@harrhy/mcp/native";
import { createRouter } from "remix/router";

import type { Config } from "../src/config.ts";
import type { Db } from "../src/db/index.ts";
import { mcpOperations, mcpTools } from "../src/operations/catalog.ts";
import {
  authenticateBearer,
  createCentralBearerAuth,
} from "../src/services/request-auth.ts";

const catalog = specTypeSchemas.ListToolsResult["~standard"].validate({
  tools: mcpTools,
});
if (catalog.issues) throw new Error("Invalid Lists MCP catalog");
const toolsResult = catalog.value;

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export function createMcpRouter(db: Db, config: Config) {
  const router = createRouter();
  const central = config.identity ? createCentralBearerAuth(db, config) : null;

  async function handle(request: Request) {
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(config.baseUrl).origin)
      return new Response("Forbidden Origin", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    let principal;
    try {
      principal = central
        ? await central(request)
        : authenticateBearer(db, request, `${config.baseUrl}/mcp`);
    } catch (error) {
      const status = error instanceof IdentityError ? error.status : 503;
      return Response.json(rpcError(null, -32001, "Unauthorized"), {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(status === 401
            ? {
                "WWW-Authenticate": `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource"`,
              }
            : {}),
        },
      });
    }
    if (!principal) {
      return Response.json(rpcError(null, -32001, "Unauthorized"), {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource"`,
        },
      });
    }
    if (request.method === "GET")
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST", "Cache-Control": "no-store" },
      });
    const handler = createNativeHandler(
      () => {
        const server = new Server(
          { name: "lists", version: "1.0.0" },
          { capabilities: { tools: { listChanged: false } } },
        );
        server.setRequestHandler("tools/list", () => toolsResult);
        server.setRequestHandler("tools/call", async (message) => {
          try {
            const operation = mcpOperations.get(message.params.name);
            if (!operation)
              throw new Error(`Unknown tool: ${message.params.name}`);
            const value = await operation.execute(
              { db, config, principal },
              message.params.arguments ?? {},
            );
            return server.projectCallToolResult(
              {
                content: [
                  { type: "text", text: JSON.stringify(value, null, 2) },
                ],
                structuredContent: Array.isArray(value)
                  ? { items: value }
                  : value,
              },
              toolsResult.tools.find(
                (tool) => tool.name === message.params.name,
              )?.outputSchema,
            );
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: error instanceof Error ? error.message : "Tool failed",
                },
              ],
              isError: true,
            };
          }
        });
        return server;
      },
      { maxRequestBytes: 128 * 1024 * 1024 },
    );
    return handler.fetch(request);
  }

  router.get("/mcp", ({ request }) => handle(request));
  router.get("/mcp/", ({ request }) => handle(request));
  router.post("/mcp", ({ request }) => handle(request));
  router.post("/mcp/", ({ request }) => handle(request));
  return router;
}
