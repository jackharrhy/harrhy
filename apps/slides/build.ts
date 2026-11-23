import { createHash } from "node:crypto";
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const dist = new URL("./dist/", import.meta.url);
await mkdir(dist, { recursive: true });
const [layout, fontCss, font] = await Promise.all([
  readFile(new URL("./slides.css", import.meta.url), "utf8"),
  readFile(new URL("../../packages/ui/allo.css", import.meta.url), "utf8"),
  readFile(
    new URL("../../packages/ui/fonts/allo-variable.woff2", import.meta.url),
  ),
]);
const { outputFiles } = await build({
  entryPoints: [new URL("./player.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
});
const player = outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const assetUrl = (path: string, bytes: Uint8Array) =>
  `${path}?v=${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`;
const fontUrl = assetUrl("/allo.woff2", font);
const css = fontCss.replace("./fonts/allo-variable.woff2", fontUrl) + layout;
await writeFile(
  new URL("assets.ts", dist),
  [
    ["player", player],
    ["css", css],
    ["fontUrl", fontUrl],
    ["allo", font.toString("base64")],
  ]
    .map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};`)
    .join("\n"),
);
