import { identityConfig } from "#lib/oauth.server";
import { createController } from "remix/router";
import {
  createNativeHandler,
  Server,
  specTypeSchemas,
} from "@harrhy/mcp/native";

import {
  mcpResourceUrl,
  requireMcpAdmin,
  mcpAuthorizationScopes,
} from "#lib/mcp-auth.server";

import { mcpTools } from "../../operations/catalog.ts";
import { routes } from "../../routes.ts";
import { callArtbinTool } from "./tools.ts";

const catalog = specTypeSchemas.ListToolsResult["~standard"].validate({
  tools: mcpTools,
});
if (catalog.issues) throw new Error("Invalid Artbin MCP catalog");
const toolsResult = catalog.value;

export default createController(routes.mcp, {
  actions: {
    async endpointGet({ request }) {
      const originError = validateOrigin(request);
      if (originError) return originError;
      const user = await requireMcpAdmin(request);
      if (user instanceof Response) return user;
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST", "Cache-Control": "no-store" },
      });
    },

    async endpoint({ request }) {
      const originError = validateOrigin(request);
      if (originError) return originError;
      const user = await requireMcpAdmin(request);
      if (user instanceof Response) return user;

      const handler = createNativeHandler(
        () => {
          const server = new Server(
            { name: "artbin", version: "1.0.0" },
            { capabilities: { tools: { listChanged: false } } },
          );
          server.setRequestHandler("tools/list", () => toolsResult);
          server.setRequestHandler("tools/call", async (message) => {
            const result = await callArtbinTool(
              user,
              message.params.name,
              message.params.arguments ?? {},
            );
            return server.projectCallToolResult(
              result,
              mcpTools.find((tool) => tool.name === message.params.name)
                ?.outputSchema,
            );
          });
          return server;
        },
        { maxRequestBytes: 8 * 1024 * 1024 },
      );
      return handler.fetch(request);
    },

    protectedResource() {
      return Response.json(
        {
          resource: mcpResourceUrl(),
          authorization_servers: [identityConfig().issuer],
          bearer_methods_supported: ["header"],
          scopes_supported: mcpAuthorizationScopes(),
        },
        { headers: { "Cache-Control": "public, max-age=300" } },
      );
    },
  },
});

function validateOrigin(request: Request): Response | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  let expected: string;
  try {
    expected = new URL(mcpResourceUrl()).origin;
  } catch {
    return new Response("MCP resource URL is invalid", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (origin === expected) return null;
  return new Response("Forbidden Origin", {
    status: 403,
    headers: { "Cache-Control": "no-store" },
  });
}
