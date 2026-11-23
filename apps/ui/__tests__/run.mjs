// Temporary workaround for @remix-run/test: its browser server needs module
// URLs under rootDir, but pnpm's global virtual store resolves dependencies
// outside the checkout. Stage only the known browser harness modules inside
// the checkout and resolve their imports from their original package paths.
// This does not change the test server's HTTP filesystem boundary.
// remix-run/remix#11793 and #11814 address the app asset server, not this
// harness; Remix 3.3.0 / @remix-run/test 1.2.0 still reproduced the error.
// Remove this adapter once the upstream harness passes the full UI check via
// the stock Remix test CLI with the global virtual store enabled.
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));
const require = createRequire(import.meta.resolve("remix/test/cli"));
const harness = new URL(
  "./app/server.js",
  pathToFileURL(require.resolve("@remix-run/test/cli")),
);
const modules = join(root, "node_modules");
const state = JSON.parse(readFileSync(join(modules, ".modules.yaml"), "utf8"));
const store = realpathSync(resolve(modules, state.virtualStoreDir));
const inside = (dir, file) => {
  const rel = relative(dir, file);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

let staging;
let hook;
const key = "harrhy.ui.remix-browser-staging";
if (!inside(root, store)) {
  staging = mkdtempSync(join(modules, ".ui-remix-browser-"));
  const packages = new Set([
    "remix",
    "@remix-run/assert",
    "@remix-run/component",
    "@remix-run/data-schema",
    "@remix-run/test",
    "@remix-run/ui",
    "@pitlane/theme",
    "@pierre/words",
  ]);
  const originals = new Map();
  const copies = new Map();
  function stage(file) {
    if (copies.has(file)) return copies.get(file);
    if (!inside(store, file) || ![".js", ".mjs"].includes(extname(file)))
      return file;
    // Copy only resolved JS modules in the browser suite's known packages.
    const parts = relative(store, file).split(sep);
    const index = parts.lastIndexOf("node_modules") + 1;
    const length = parts[index]?.startsWith("@") ? 2 : 1;
    if (
      !index ||
      !packages.has(parts.slice(index, index + length).join("/")) ||
      parts[index + length] !== "dist" ||
      realpathSync(file) !== file
    )
      return file;
    const copy = join(staging, `${copies.size}${extname(file)}`);
    copyFileSync(file, copy);
    copies.set(file, copy);
    originals.set(copy, file);
    return copy;
  }

  // Adapt just the pinned test server. HTTP requests still use the unchanged
  // checkout-root path mapping and never name files to copy from the store.
  globalThis[Symbol.for(key)] = {
    stage,
    original: (file) => originals.get(file) ?? file,
  };
  hook = registerHooks({
    load(url, context, next) {
      const loaded = next(url, context);
      if (url !== harness.href) return loaded;
      let source = loaded.source.toString();
      for (const [before, after] of [
        [
          "let rel = path.relative(rootDir, filePath);",
          "let rel = path.relative(rootDir, staging.stage(filePath));",
        ],
        [
          "rewriteImports(code, filePath, rootDir);",
          "rewriteImports(code, staging.original(filePath), rootDir);",
        ],
      ]) {
        if (source.split(before).length !== 2) {
          throw new Error(
            "Recheck the Remix browser staging adapter after upgrading @remix-run/test",
          );
        }
        source = source.replace(before, after);
      }
      return {
        ...loaded,
        source: `const staging = globalThis[Symbol.for(${JSON.stringify(key)})];\n${source}`,
      };
    },
  });
}

try {
  const { runRemixTest } = await import("remix/test/cli");
  process.exitCode = await runRemixTest({
    cwd: root,
    glob: { test: "apps/ui/__tests__/*.test{.browser,.e2e}.{ts,tsx}" },
  });
} finally {
  hook?.deregister();
  delete globalThis[Symbol.for(key)];
  if (staging) rmSync(staging, { recursive: true, force: true });
}
