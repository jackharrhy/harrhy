import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
await Promise.all([
  build({
    entryPoints: ["browser.ts"],
    bundle: true,
    format: "esm",
    // Preserve Pierre's dynamic imports for highlighters and language grammars.
    splitting: true,
    outdir: "dist/client",
    chunkNames: "browser-chunks/[name]-[hash]",
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
