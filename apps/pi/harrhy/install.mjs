import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync("npm", ["ci", "--ignore-scripts"], {
  cwd: resolve(app, "compat"),
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0)
  throw new Error(`Nested npm ci exited ${result.status}`);

// Keep upstream's app-local overrides (marked, TypeScript, yaml) ahead of the
// isolated root dependencies without admitting Harrhy's React/type versions.
for (const directory of ["compat/node_modules", "compat/host/node_modules"]) {
  const root = resolve(app, directory);
  for (const name of readdirSync(root)) {
    if (name.startsWith(".")) continue;
    const entries = name.startsWith("@")
      ? readdirSync(resolve(root, name)).map((child) => `${name}/${child}`)
      : [name];
    for (const entry of entries) {
      const target = resolve(app, "node_modules", entry);
      const parent = resolve(target, "..");
      mkdirSync(parent, { recursive: true });
      const existing = lstatSync(target, { throwIfNoEntry: false });
      if (existing) {
        if (!existing.isSymbolicLink())
          throw new Error(`Refusing to replace ${target}`);
        unlinkSync(target);
      }
      symlinkSync(relative(parent, resolve(root, entry)), target, "dir");
    }
  }
}
