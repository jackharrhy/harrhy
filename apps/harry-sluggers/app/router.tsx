import { createRouter, createController } from "remix/router";
import { get, route } from "remix/routes";
import { render } from "remix/middleware/render";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { document, page } from "./pages.tsx";
import { concepts } from "./themes/index.ts";
import type { openArchive } from "./database.ts";

const routes = route({
  home: get("/"),
  players: get("/players"),
  player: get("/players/:id"),
  teams: get("/teams"),
  team: get("/teams/:id"),
  lineup: get("/teams/:id/lineup"),
  matches: get("/matches"),
  match: get("/matches/:id"),
  matchLineup: get("/matches/:id/lineup"),
  matchStats: get("/matches/:id/stats"),
  day: get("/days/:id"),
  draft: get("/draft"),
  events: get("/events"),
  trades: get("/trades"),
  trade: get("/trades/:id"),
  health: get("/healthz"),
  runtime: get("/runtime.js"),
  fonts: get("/fonts.css"),
  asset: get("/assets/*asset"),
});
export async function createArchiveApp(
  archive: Pick<ReturnType<typeof openArchive>, "read">,
  assetRoot?: string,
) {
  const assets = new Set(assetRoot ? await readdir(assetRoot) : []);
  const runtime = await readFile(
    new URL("../dist/runtime.js", import.meta.url),
  );
  const router = createRouter();
  const controller = createController(routes, {
    middleware: [render()],
    actions: {
      home: show,
      players: show,
      player: show,
      teams: show,
      team: show,
      lineup: show,
      matches: show,
      match: show,
      matchLineup: show,
      matchStats: show,
      day: show,
      draft: show,
      events: show,
      trades: show,
      trade: show,
      runtime() {
        return new Response(runtime, {
          headers: { "Content-Type": "text/javascript" },
        });
      },
      async health() {
        await archive.read();
        return Response.json({ status: "ready" });
      },
      fonts() {
        return new Response(
          assetRoot
            ? [
                ["Cezanne", "cezanne"],
                ["Rodin", "rodin"],
                ["Happiness", "happiness"],
                ["Bolt", "bolt"],
              ]
                .map(
                  ([name, file]) =>
                    `@font-face{font-family:Sluggers${name};src:url('/assets/${file}.woff2') format('woff2');font-display:swap}`,
                )
                .join("\n")
            : "",
          { headers: { "Content-Type": "text/css" } },
        );
      },
      async asset(context) {
        const name = context.params.asset;
        if (
          !assetRoot ||
          !assets.has(name) ||
          !/^(?:(?:player(?:-side)?|team)-[1-9]\d{0,8}\.png|(?:cezanne|rodin|happiness|bolt)\.woff2)$/.test(
            name,
          )
        )
          return new Response("Not found", { status: 404 });
        try {
          return new Response(await readFile(join(assetRoot, name)), {
            headers: {
              "Content-Type": name.endsWith(".png")
                ? "image/png"
                : "font/woff2",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  });
  type Context = {
    request: Request;
    render: import("remix/middleware/render").RenderFunction;
  };
  async function show(context: Context) {
    const url = new URL(context.request.url);
    const requested = url.searchParams.get("theme");
    const saved = context.request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)sluggers-theme=([a-z-]+)/)?.[1];
    if (!requested && concepts.some((c) => c.id === saved))
      url.searchParams.set("theme", saved!);
    const view = page(await archive.read(), url, assets);
    return context.render(document(view.title, view.body, url), {
      status: view.status ?? 200,
      headers:
        requested && concepts.some((c) => c.id === requested)
          ? {
              "Set-Cookie": `sluggers-theme=${requested}; Path=/; SameSite=Lax; HttpOnly; Max-Age=31536000`,
            }
          : {},
    });
  }
  router.map(routes, controller);
  return {
    async fetch(request: Request) {
      let response: Response;
      if (!["GET", "HEAD"].includes(request.method))
        response = new Response("Read-only website", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      else
        try {
          response = await router.fetch(request);
        } catch {
          response = new Response(
            "The league database is temporarily unavailable. Please try again shortly.",
            { status: 503 },
          );
        }
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "no-referrer");
      response.headers.set(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      );
      return response;
    },
  };
}
