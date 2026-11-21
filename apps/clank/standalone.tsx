import { renderToString } from "remix/component/server";
import { createRouter } from "remix/router";
import { css } from "remix/component";
import { cleanTheme, themeRoot, themeStyles } from "@harrhy/ui/theme";
import { Badge, Heading, Inline, Stack } from "@harrhy/ui/native";
import { deployment, type DeploymentBindings } from "./app/deployment.ts";
import { SessionList } from "./app/sessions.tsx";
export { SessionCell } from "./app/session-cell.ts";

declare const BROWSER_MODULE: string;
interface Env extends DeploymentBindings {
  HARRHY_CLANK_BRIDGE_TOKEN: string;
  HARRHY_CLANK_VIEW_PASSWORD: string;
  SESSIONS: {
    getByName(name: string): { fetch(req: Request): Promise<Response> };
  };
}
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};
function catalogRouter(readOnly: boolean) {
  const router = createRouter();
  router.get("/", async () => {
    const html = await renderToString(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Clank</title>
          <script type="module" src="/sessions.js" />
        </head>
        <body
          mix={[
            themeStyles(cleanTheme),
            themeRoot,
            css({ margin: 0, minHeight: "100dvh" }),
          ]}
        >
          <main
            mix={css({
              maxWidth: "56rem",
              marginInline: "auto",
              padding: "clamp(1rem, 4vw, 2rem)",
            })}
          >
            <Stack>
              <Inline>
                <Heading level={1}>Clank</Heading>
                <Badge>{readOnly ? "Read only" : "Pi fixture"}</Badge>
              </Inline>
              <SessionList readOnly={readOnly} />
            </Stack>
          </main>
        </body>
      </html>,
    );
    return new Response(`<!doctype html>${html}`, {
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    });
  });
  router.get(
    "/sessions.js",
    () =>
      new Response(BROWSER_MODULE, {
        headers: {
          ...headers,
          "Content-Type": "text/javascript; charset=utf-8",
        },
      }),
  );
  return router;
}
const fixture = catalogRouter(false),
  readOnly = catalogRouter(true);
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const config = deployment(env);
    if (!config) return new Response(null, { status: 503, headers });
    if (
      url.host !== config.origin.host ||
      (!config.readOnly && url.origin !== config.origin.origin) ||
      request.method !== "GET" ||
      url.search ||
      !["/", "/sessions.js", "/live"].includes(url.pathname)
    )
      return new Response(null, { status: 404, headers });
    if (
      !env.HARRHY_CLANK_VIEW_PASSWORD ||
      !/^[a-f0-9]{64}$/.test(env.HARRHY_CLANK_BRIDGE_TOKEN)
    )
      return new Response(null, { status: 503, headers });
    if (
      request.headers.get("Authorization") !==
      `Basic ${btoa(`clank:${env.HARRHY_CLANK_VIEW_PASSWORD}`)}`
    )
      return new Response("Clank fixture sign-in required", {
        status: 401,
        headers: {
          ...headers,
          "WWW-Authenticate": 'Basic realm="Clank fixture"',
        },
      });
    if (url.pathname === "/live") {
      if (request.headers.get("Origin") !== config.origin.origin)
        return new Response(null, { status: 403, headers });
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return new Response(null, { status: 426, headers });
      return env.SESSIONS.getByName("fixture").fetch(request);
    }
    if (request.headers.has("Upgrade"))
      return new Response(null, { status: 404, headers });
    return (config.readOnly ? readOnly : fixture).fetch(request);
  },
};
