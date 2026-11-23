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
  const workbench = async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const [, view, slug] = url.pathname.split("/");
    const scenes = view === "scenes";
    const scene = slug ?? "forms";
    const cookoff = scenes && scene === "clank";
    const story = stories.find(
      (item) => item.id === (slug === "navigation-menu" ? "tabs" : slug),
    );
    if (
      (scenes &&
        !["forms", "radio", "sluggers", "themes", "clank"].includes(scene)) ||
      (!scenes && slug && !story)
    )
      return new Response("Not found", { status: 404 });
    const requestedDensity = url.searchParams.get("density");
    const density =
      requestedDensity === "compact" ||
      (requestedDensity !== "standard" && cookoff)
        ? "compact"
        : "standard";
    const candidate = url.searchParams.get("theme");
    const theme: ThemeName =
      candidate && Object.hasOwn(themes, candidate)
        ? (candidate as ThemeName)
        : "basic";
    const entry = await assets.getScriptEntry("apps/ui/app/public/entry.ts");
    const stream = renderToStream(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex, nofollow" />
          <link rel="stylesheet" href="/assets/ui/clank/fonts.css" />
          <title>@harrhy/ui workbench</title>
          <link rel="stylesheet" href="/assets/hui/fonts.css" />
          <link rel="stylesheet" href="/assets/hui/allo.css" />
          {theme === "newspaper" && (
            <link
              rel="preload"
              href="/assets/hui/fonts/ibm-plex-sans-latin.woff2"
              as="font"
              type="font/woff2"
              crossOrigin="anonymous"
            />
          )}
          {scenes && scene === "radio" && (
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
            <Cookoff initial={theme} density={density} />
          ) : scenes ? (
            <Scenes theme={theme} scene={scene} density={density} />
          ) : (
            <Explorer
              theme={theme}
              density={density}
              story={story?.id ?? "button"}
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
  };
  router.get(routes.home, ({ request }) => {
    const url = new URL(request.url);
    const view = url.searchParams.get("view");
    const scene = url.searchParams.get("scene");
    const component = url.searchParams.get("component");
    const knownScene =
      scene &&
      ["forms", "radio", "sluggers", "themes", "clank"].includes(scene);
    const story = stories.find(
      (item) =>
        item.id === (component === "navigation-menu" ? "tabs" : component),
    );
    const path =
      view === "scenes"
        ? knownScene
          ? routes.scene.href({ scene })
          : routes.scenes.href()
        : story
          ? routes.component.href({ component: story.id })
          : routes.explorer.href();
    for (const key of ["view", "scene", "component"])
      url.searchParams.delete(key);
    return new Response(null, {
      status: 302,
      headers: { Location: path + url.search, "Cache-Control": "no-store" },
    });
  });
  router.get(routes.explorer, workbench);
  router.get(routes.component, workbench);
  router.get(routes.scenes, workbench);
  router.get(routes.scene, workbench);
  return {
    async fetch(request: Request) {
      if (!hosts.includes(new URL(request.url).hostname.toLowerCase()))
        return new Response("Not found", { status: 404 });
      return router.fetch(request);
    },
    close: () => assets.close(),
  };
}
