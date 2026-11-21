import { createRouter } from "remix/router";
import { ImportMap, renderToStream } from "remix/component/server";
import { css } from "remix/component";
import { routes } from "./routes.ts";
import { createAssets } from "./assets.ts";
import { createSluggersLabRoutes } from "./public/sluggers/lab.server.tsx";
import { Scenes } from "./public/scenes.tsx";
import { Cookoff } from "./public/clank/scene.tsx";
import { themes, type ThemeName } from "./public/themes.ts";
import { Explorer, stories } from "./public/explorer.tsx";

import { defaultHosts } from "./hosts.ts";
export { defaultHosts } from "./hosts.ts";
export function createApp(
  hosts: readonly string[] = defaultHosts,
  options: {
    sluggersPrivateFonts?: boolean;
    sluggersLab?: { enabled: boolean; directory?: string };
  } = {},
) {
  const sluggersPrivateFonts =
    options.sluggersPrivateFonts ??
    process.env.HARRHY_UI_SLUGGERS_PRIVATE_FONTS === "1";
  const assets = createAssets();
  const router = createRouter();
  createSluggersLabRoutes(router, assets, options.sluggersLab);
  router.get(
    "/assets/*",
    async ({ request }) =>
      (await assets.fetch(request)) ??
      new Response("Not found", { status: 404 }),
  );
  router.get("/healthz", () => new Response("ok"));
  router.get(routes.home, async ({ request }) => {
    const url = new URL(request.url);
    const cookoff =
      url.searchParams.get("view") === "scenes" &&
      url.searchParams.get("scene") === "clank";
    const candidate = url.searchParams.get("theme");
    const theme: ThemeName =
      candidate && Object.hasOwn(themes, candidate)
        ? (candidate as ThemeName)
        : "clean";
    const entry = await assets.getScriptEntry("apps/ui/app/public/entry.ts");
    const stream = renderToStream(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex, nofollow" />
          {cookoff && (
            <link rel="stylesheet" href="/assets/ui/clank/fonts.css" />
          )}
          <title>@harrhy/ui workbench</title>
          <link rel="stylesheet" href="/assets/hui/fonts.css" />
          {theme === "brutalist" && (
            <link
              rel="preload"
              href="/assets/hui/fonts/ibm-plex-sans-latin.woff2"
              as="font"
              type="font/woff2"
              crossOrigin="anonymous"
            />
          )}
          {url.searchParams.get("scene") === "radio" && (
            <link rel="stylesheet" href="/assets/ui/radio/fonts.css" />
          )}
          {sluggersPrivateFonts && (
            <link rel="stylesheet" href="/assets/ui/sluggers/fonts.css" />
          )}
          <ImportMap value={entry.importMap} />
          {entry.preloads.map((href) => (
            <link rel="modulepreload" href={href} />
          ))}
          <script type="module" src={entry.href} />
        </head>
        <body mix={css({ margin: 0 })}>
          {cookoff ? (
            <Cookoff
              initial={
                candidate === "clean"
                  ? "Clean"
                  : candidate === "brutalist"
                    ? "Artbin"
                    : "Harrhy"
              }
            />
          ) : url.searchParams.get("view") === "scenes" ? (
            <Scenes
              theme={theme}
              scene={
                url.searchParams.get("scene") === "radio"
                  ? "radio"
                  : url.searchParams.get("scene") === "sluggers"
                    ? "sluggers"
                    : url.searchParams.get("scene") === "themes"
                      ? "themes"
                      : "forms"
              }
            />
          ) : (
            <Explorer
              theme={theme}
              story={
                stories.find(
                  (story) =>
                    story.id ===
                    (url.searchParams.get("component") === "navigation-menu"
                      ? "tabs"
                      : url.searchParams.get("component")),
                )?.id ?? "button"
              }
              query={(url.searchParams.get("q") ?? "").slice(0, 100)}
            />
          )}
        </body>
      </html>,
      {
        async resolveClientEntry(id, component) {
          const metadata = await assets.getScriptEntry(id);
          return {
            ...metadata,
            exportName: id.split("#")[1] || component.name,
          };
        },
      },
    );
    return new Response(stream, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  });
  return {
    async fetch(request: Request) {
      if (!hosts.includes(new URL(request.url).hostname.toLowerCase()))
        return new Response("Not found", { status: 404 });
      return router.fetch(request);
    },
    close: () => assets.close(),
  };
}
