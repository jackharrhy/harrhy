import { build } from "esbuild";
import { copyFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const pi = new URL("../../pi/", import.meta.url);
const {
  compilerOptions: { paths },
} = JSON.parse(await readFile(new URL("tsconfig.json", pi)));
await build({
  entryPoints: ["app/browser.tsx"],
  outfile: "dist/assets/clank.js",
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "remix/component",
  tsconfigRaw: { compilerOptions: { baseUrl: fileURLToPath(pi), paths } },
  define: { "process.env.NODE_ENV": '"production"' },
});

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
