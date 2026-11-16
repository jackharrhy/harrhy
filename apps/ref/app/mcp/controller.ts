import { currentLog } from "@harrhy/logger";
import { openLinkedJob } from "../logging.ts";
import { createController } from "remix/router";
import { createNativeHandler, Server } from "@harrhy/mcp";
import { AppRuntime, AppIdentity, McpAccess } from "../data/runtime.ts";
import { routes } from "../routes.ts";
import { callRefTool, toolsFor } from "./tools.ts";

export default createController(routes.mcp, {
  actions: {
    endpointGet() {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST", "Cache-Control": "no-store" },
      });
    },
    async endpoint(context) {
      const requestLog = currentLog();
      const access = context.get(McpAccess);
      if (!access)
        return new Response("Bearer authorization required", { status: 401 });
      const runtime = context.get(AppRuntime)!;
      const origin = context.get(AppIdentity)!.origin;
      const handler = createNativeHandler(
        () => {
          const server = new Server(
            { name: "ref", version: "1.0.0" },
            { capabilities: { tools: { listChanged: false } } },
          );
          server.setRequestHandler("tools/list", () =>
            openLinkedJob(
              {
                operation: "ref.mcp.tools_list",
                "mcp.method": "tools/list",
                "actor.id": access.subject.slice(0, 128),
              },
              requestLog,
            ).run((log) => {
              const tools = toolsFor(access);
              log.set({ "tools.count": tools.length, "mcp.outcome": "ok" });
              return { tools };
            }),
          );
          server.setRequestHandler("tools/call", (message) =>
            openLinkedJob(
              {
                operation: "ref.mcp.tool",
              },
              requestLog,
            ).run(async () =>
              server.projectCallToolResult(
                await callRefTool(
                  runtime,
                  access,
                  message.params.name,
                  message.params.arguments ?? {},
                  origin,
                ),
                undefined,
              ),
            ),
          );
          return server;
        },
        { maxRequestBytes: 28 * 1024 * 1024 },
      );
      return handler.fetch(context.request);
    },
  },
});
