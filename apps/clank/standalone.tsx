import { renderToString } from "remix/component/server";
import { createRouter } from "remix/router";
import { Badge } from "@harrhy/ui/native";
import { SessionList } from "./app/sessions.tsx";
export { SessionCell } from "./app/session-cell.ts";

declare const BROWSER_MODULE: string;
interface Env {
  HARRHY_CLANK_BRIDGE_TOKEN: string;
  HARRHY_CLANK_VIEW_PASSWORD: string;
  SESSIONS: {
    getByName(name: string): { fetch(req: Request): Promise<Response> };
  };
}
const origin = "http://127.0.0.1:18148";
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};
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
      <body>
        <main>
          <h1>Clank</h1>
          <Badge>Pi fixture</Badge>
          <SessionList />
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
      headers: { ...headers, "Content-Type": "text/javascript; charset=utf-8" },
    }),
);
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.origin !== origin || request.method !== "GET")
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
      if (request.headers.get("Origin") !== origin)
        return new Response(null, { status: 403, headers });
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return new Response(null, { status: 426, headers });
      return env.SESSIONS.getByName("fixture").fetch(request);
    }
    return router.fetch(request);
  },
};
