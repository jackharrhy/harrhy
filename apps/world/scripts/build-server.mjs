import { build } from "esbuild";
await build({
  entryPoints: ["server/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  platform: "node",
  target: "node26",
  format: "esm",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
