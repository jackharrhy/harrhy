import { build } from "esbuild";

const dev = process.argv.includes("--serve");
const outfile = dev ? ".celld/owner/dev.mjs" : ".celld/owner/server.mjs";

const browser = await build({
  entryPoints: ["app/browser.ts"],
  tsconfig: "tsconfig.json",
  bundle: true,
  format: "esm",
  minify: !dev,
  write: false,
});
await build({
  entryPoints: ["app/server/start.ts"],
  tsconfig: "tsconfig.json",
  bundle: true,
  minify: !dev,
  format: "esm",
  platform: "node",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  outfile,
  define: {
    OWNER_BROWSER_MODULE: JSON.stringify(browser.outputFiles[0].text),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (dev) await import("../" + outfile);
