import { bindLogContext, currentLog } from "@harrhy/logger";
import { openLinkedJob } from "../logging.ts";
import { get, post, route } from "remix/routes";
import type { AppContext } from "../router.ts";
import { archiveMcpPath } from "./auth.ts";
import { createController } from "remix/router";
import { createNativeHandler, Server } from "@harrhy/mcp";
import { AppRuntime, AppIdentity, McpAccess } from "../data/runtime.ts";
import { routes } from "../routes.ts";
import { callRefTool, toolsFor } from "./tools.ts";

const actions = {
  endpointGet() {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    });
  },
  async endpoint(context: AppContext & { request: Request }) {
    const access = context.get(McpAccess);
    if (!access)
      return new Response("Bearer authorization required", { status: 401 });
    const runtime = context.get(AppRuntime)!;
    const identity = context.get(AppIdentity)!;
    const archive = new URL(context.request.url).pathname === archiveMcpPath;
    if (
      archive !== (access.archiveOnly === true) ||
      (archive && identity.onAlternate)
    )
      return new Response("Forbidden", { status: 403 });
    const origin = identity.origin;
    const handler = createNativeHandler(
      () => {
        const server = new Server(
          { name: "ref", version: "1.0.0" },
          { capabilities: { tools: { listChanged: false } } },
        );
        server.setRequestHandler(
          "tools/list",
          bindLogContext(() =>
            openLinkedJob({
              operation: "ref.mcp.tools_list",
              "mcp.method": "tools/list",
              "actor.id": access.subject.slice(0, 128),
            }).run(() => {
              const tools = toolsFor(access);
              currentLog()?.set({
                "tools.count": tools.length,
                "mcp.outcome": "ok",
              });
              return { tools };
            }),
          ),
        );
        server.setRequestHandler(
          "tools/call",
          bindLogContext((message) =>
            openLinkedJob({ operation: "ref.mcp.tool" }).run(async () =>
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
          ),
        );
        return server;
      },
      { maxRequestBytes: 28 * 1024 * 1024 },
    );
    return handler.fetch(context.request);
  },
};

export default createController(routes.mcp, { actions });

export const archiveMcpRoutes = route({
  endpointGet: get(archiveMcpPath),
  endpoint: post(archiveMcpPath),
});
export const archiveMcpController = createController(archiveMcpRoutes, {
  actions,
});
