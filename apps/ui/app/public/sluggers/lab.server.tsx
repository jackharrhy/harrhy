import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { createRouter } from "remix/router";
import { renderToStream, ImportMap } from "remix/component/server";
import type { createAssets } from "../../assets.ts";
import { SluggersLab } from "./lab/page.tsx";
import type { LabCorpus } from "./lab/model.ts";

export function createSluggersLabRoutes(
  router: ReturnType<typeof createRouter>,
  assets: ReturnType<typeof createAssets>,
  options: { enabled?: boolean; directory?: string } = {},
) {
  const enabled =
    options.enabled ?? process.env.HARRHY_UI_SLUGGERS_PRIVATE_REVIEW === "1";
  if (!enabled) return;
  const directory = resolve(
    options.directory ??
      process.env.HARRHY_UI_SLUGGERS_REVIEW_DIR ??
      "/home/jack/.local/share/sluggers-lab",
  );
  router.get("/__sluggers-lab/assets/*asset", async ({ params }) => {
    const asset = params.asset;
    if (
      !/^(player-\d+\.png|team-\d+\.png|reference-[a-z-]+\.webp)$/.test(asset)
    )
      return new Response("Not found", { status: 404 });
    const manifest = JSON.parse(
      await readFile(resolve(directory, "manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    if (!Object.hasOwn(manifest, asset))
      return new Response("Not found", { status: 404 });
    try {
      const data = await readFile(resolve(directory, "assets", asset));
      return new Response(data, {
        headers: {
          "Content-Type": asset.endsWith("webp") ? "image/webp" : "image/png",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  router.get("/sluggers-lab", async ({ request }) => {
    const corpus = JSON.parse(
      await readFile(resolve(directory, "corpus.json"), "utf8"),
    ) as LabCorpus;
    const url = new URL(request.url);
    const entry = await assets.getScriptEntry("apps/ui/app/public/entry.ts");
    return new Response(
      renderToStream(
        <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
            <meta name="robots" content="noindex, nofollow" />
            <title>Sluggers · Design cookoff</title>
            {process.env.HARRHY_UI_SLUGGERS_PRIVATE_FONTS === "1" ? (
              <link rel="stylesheet" href="/assets/ui/sluggers/fonts.css" />
            ) : null}
            <ImportMap value={entry.importMap} />
            {entry.preloads.map((href) => (
              <link rel="modulepreload" href={href} />
            ))}
            <script type="module" src={entry.href} />
          </head>
          <body style={{ margin: 0 }}>
            <SluggersLab
              corpus={corpus}
              initialConcept={
                url.searchParams.get("concept") ?? "broadcast-prism"
              }
              initialScreen={url.searchParams.get("screen") ?? "matchday"}
            />
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
      ),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  });
}
