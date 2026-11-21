import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
const browser = await build({
  entryPoints: ["app/start.ts"],
  bundle: true,
  format: "esm",
  minify: true,
  write: false,
});
await build({
  entryPoints: ["standalone.tsx"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  conditions: ["workerd", "browser"],
  mainFields: ["module", "main"],
  external: ["node:*", "cloudflare:*"],
  outfile: ".celld/standalone/worker.mjs",
  define: {
    BROWSER_MODULE: JSON.stringify(browser.outputFiles[0].text),
    "process.env.NODE_ENV": '"production"',
  },
});

await copyFile("standalone.jsonc", ".celld/standalone/wrangler.jsonc");
