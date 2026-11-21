import { createRouter } from "remix/router";
import { createOwnerGate } from "./app/owner.ts";

interface Env {
  HARRHY_CLANK_ORIGIN: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const router = createRouter();
router.get(
  "/clank",
  () =>
    new Response(
      `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clank · Pi sessions</title><script type="module" src="/clank/assets/clank.js"></script></head>
<body><main><h1>Pi sessions</h1><div id="clank-sessions" aria-live="polite">Connecting to Pi…</div></main></body></html>`,
      {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    ),
);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const headers = {
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    };
    if (
      request.method !== "GET" ||
      (path !== "/clank" && path !== "/clank/assets/clank.js")
    ) {
      return new Response("Not found", { status: 404, headers });
    }
    let status: 200 | 401 | 503 = 503;
    try {
      status = await createOwnerGate(new URL(env.HARRHY_CLANK_ORIGIN))(request);
    } catch {
      // Missing/invalid fixture configuration fails closed.
    }
    if (status !== 200)
      return new Response(
        status === 401 ? "Owner sign-in required" : "Pi unavailable",
        {
          status,
          headers,
        },
      );
    const response =
      path === "/clank"
        ? await router.fetch(request)
        : await env.ASSETS.fetch(
            new Request(new URL("/clank.js", request.url)),
          );
    const result = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers))
      result.headers.set(name, value);
    return result;
  },
};
