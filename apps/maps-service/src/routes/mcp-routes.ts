import { z } from "zod";
import {
  createNativeHandler,
  Server,
  specTypeSchemas,
} from "@harrhy/mcp/native";
import {
  mcpAuthorizationScopes,
  mcpResourceUrl,
  requireMcpAdmin,
} from "../mcp-auth.js";
import { mcpOperationsByName, mcpToolDescriptions } from "../mcp-operations.js";
import { ServiceHttpError } from "../service-http.js";
import { defineWebRoute } from "../service-routing.js";
import { webError } from "../service-web-http.js";
import type { MapsServiceOptions } from "../service-options.js";

const catalog = specTypeSchemas.ListToolsResult["~standard"].validate({
  tools: mcpToolDescriptions,
});
if (catalog.issues) throw new Error("Invalid Worldview MCP catalog");
const toolsResult = catalog.value;

export function createMcpRoutes(options: MapsServiceOptions) {
  return [
    defineWebRoute(
      "mcp-protected-resource",
      "GET",
      "/.well-known/oauth-protected-resource/mcp",
      () => {
        if (!options.mcpAuth) {
          return webError(503, "Worldview MCP is not configured");
        }
        return new Response(
          JSON.stringify({
            resource: mcpResourceUrl(options.mcpAuth),
            authorization_servers: [options.mcpAuth.issuer],
            bearer_methods_supported: ["header"],
            scopes_supported: mcpAuthorizationScopes(options.mcpAuth),
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=300",
            },
          },
        );
      },
    ),
    defineWebRoute("mcp-get", "GET", "/mcp", () =>
      webError(
        405,
        "MCP SSE streams are not offered",
        new Headers({ Allow: "POST" }),
      ),
    ),
    defineWebRoute("mcp-post", "POST", "/mcp", async (context) => {
      const config = options.mcpAuth;
      if (!config) return webError(503, "Worldview MCP is not configured");
      const origin = context.request.headers.get("origin");
      if (
        (origin && origin !== context.publicOrigin) ||
        context.publicOrigin !== config.publicUrl
      ) {
        return webError(403, "Worldview MCP origin is not allowed");
      }
      let user;
      try {
        user = await requireMcpAdmin(
          context.request.headers.get("authorization") ?? undefined,
          config,
          options.database,
          options.fetch,
        );
      } catch (error) {
        if (!(error instanceof ServiceHttpError)) throw error;
        const headers = new Headers();
        if (error.status === 401) {
          headers.set(
            "WWW-Authenticate",
            `Bearer resource_metadata="${config.publicUrl}/.well-known/oauth-protected-resource/mcp", scope="${mcpAuthorizationScopes(config).join(" ")}"`,
          );
        }
        return webError(error.status, error.message, headers);
      }
      const handler = createNativeHandler(
        () => {
          const server = new Server(
            { name: "tea-maps", version: "0.1.0" },
            { capabilities: { tools: { listChanged: false } } },
          );
          server.setRequestHandler("tools/list", () => toolsResult);
          server.setRequestHandler("tools/call", async (message) => {
            const name = message.params.name;
            const tool = mcpOperationsByName.get(name);
            if (!tool)
              return {
                content: [{ type: "text", text: `Unknown tool: ${name}` }],
                isError: true,
              };
            try {
              const value = await tool.execute(
                options,
                user,
                message.params.arguments ?? {},
              );
              if (!value || typeof value !== "object" || Array.isArray(value))
                throw new Error("Invalid Worldview MCP result");
              return server.projectCallToolResult(
                {
                  content: [
                    { type: "text", text: JSON.stringify(value, null, 2) },
                  ],
                  structuredContent: value as Record<string, unknown>,
                },
                undefined,
              );
            } catch (error) {
              const expected =
                error instanceof ServiceHttpError ||
                error instanceof z.ZodError;
              if (!expected) console.error("Worldview MCP tool failed", error);
              return {
                content: [
                  {
                    type: "text",
                    text: expected ? error.message : "Tool failed",
                  },
                ],
                isError: true,
              };
            }
          });
          return server;
        },
        { maxRequestBytes: 3 * 1024 * 1024 },
      );
      return handler.fetch(context.request);
    }),
  ] as const;
}
