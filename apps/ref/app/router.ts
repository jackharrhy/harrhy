import { createRouter, type MiddlewareContext } from "remix/router";
import type { IdentityConfig } from "@harrhy/identity";
import { log } from "@harrhy/logger/middleware";
import { asyncContext } from "remix/middleware/async-context";
import { formData } from "remix/middleware/form-data";
import { render } from "remix/middleware/render";
import { csp } from "remix/middleware/csp";
import rootController from "./actions/controller.tsx";
import authController from "./actions/auth-controller.ts";
import boardsController from "./actions/boards/controller.tsx";
import resourcesController from "./actions/resources/controller.tsx";
import archiveController from "./actions/archive/controller.ts";
import mcpController from "./mcp/controller.ts";
import type { RefMcpAccess } from "./mcp/auth.ts";
import {
  AppRuntime,
  AppIdentity,
  McpAccess,
  Authenticated,
  CurrentSessionToken,
  type AppRuntimeService,
} from "./data/runtime.ts";
import { routes } from "./routes.ts";

export type AppContext = MiddlewareContext<
  [
    ReturnType<typeof log>,
    ReturnType<typeof formData>,
    ReturnType<typeof render>,
  ]
>;

declare module "remix/router" {
  interface RouterTypes {
    context: AppContext;
  }
}

export function createAppRouter(
  runtime: AppRuntimeService,
  authenticated: boolean,
  token: string | null,
  identity: { config: IdentityConfig; origin: string },
  mcpAccess: RefMcpAccess | null = null,
) {
  const router = createRouter<AppContext>({
    middleware: [
      asyncContext(),
      log(),
      (context, next) => {
        context.set(AppRuntime, runtime);
        context.set(Authenticated, authenticated);
        context.set(CurrentSessionToken, token);
        context.set(AppIdentity, identity);
        context.set(McpAccess, mcpAccess);
        return next();
      },
      formData({
        maxFiles: 1,
        maxFileSize: 20 * 1024 * 1024,
        maxParts: 12,
        maxTotalSize: 21 * 1024 * 1024,
      }),
      csp({
        policy: ({ nonce, context }) => {
          const requestUrl = new URL(context.request.url);
          const socketOrigin = `${requestUrl.protocol === "https:" ? "wss:" : "ws:"}//${requestUrl.host}`;
          return {
            defaultSrc: ["'none'"],
            scriptSrc: ["'self'", `'nonce-${nonce}'`],
            styleSrc: ["'self'", `'nonce-${nonce}'`],
            imgSrc: ["'self'", "blob:", "data:", "https:"],
            mediaSrc: ["'self'", "https://video.twimg.com"],
            connectSrc: ["'self'", socketOrigin],
            workerSrc: ["'self'"],
            frameSrc: [
              "https://platform.twitter.com",
              "https://www.youtube-nocookie.com",
              "https://www.instagram.com",
            ],
            formAction: ["'self'"],
            baseUri: ["'none'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          };
        },
      }),
      render(),
    ],
  });
  router.map(routes, rootController);
  router.map(routes.auth, authController);
  router.map(routes.boards, boardsController);
  router.map(routes.resources, resourcesController);
  router.map(routes.archive, archiveController);
  router.map(routes.mcp, mcpController);
  return router;
}
