import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
await Promise.all([
  build({
    entryPoints: ["browser.ts"],
    bundle: true,
    format: "esm",
    outfile: "dist/client/browser.js",
    minify: true,
  }),
  build({
    entryPoints: ["worker.ts"],
    bundle: true,
    format: "esm",
    outfile: "dist/worker.js",
    platform: "node",
    external: ["cloudflare:*"],
    minify: true,
  }),
]);
