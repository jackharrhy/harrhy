import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { packageManager } = JSON.parse(read("package.json"));
const workspaces = new Map();
for (const directory of ["apps", "packages"]) {
  for (const entry of readdirSync(new URL(directory, root), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const path = `${directory}/${entry.name}`;
    if (!existsSync(new URL(`${path}/package.json`, root))) continue;
    const manifest = JSON.parse(read(`${path}/package.json`));
    workspaces.set(manifest.name, { path, manifest });
  }
}

function selectedWorkspaces(workspace) {
  const selected = new Set();
  const visit = ({ path, manifest }) => {
    if (selected.has(path)) return;
    selected.add(path);
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (workspaces.has(name)) visit(workspaces.get(name));
      }
    }
  };
  visit(workspace);
  return [...selected].toSorted((a, b) => a.localeCompare(b));
}

const bundledApps = new Set(["burger", "gurgur", "pool"]);
const celldApps = new Set(["ref", "radio", "worldview", "maps-collaboration"]);
const rootToolsApps = new Set([
  "artbin",
  "cms",
  "maps-compiler",
  "maps-service",
  "maps-collaboration",
  "worldview",
]);
const productionApps = new Set([
  "8mb",
  "artbin",
  "cms",
  "garden",
  "letters-to-steve",
  "lists",
  "maps-compiler",
  "maps-service",
  "marky",
  "rotund",
  "ui",
]);

for (const [name, workspace] of workspaces) {
  const { path: workspacePath } = workspace;
  if (
    !workspacePath.startsWith("apps/") ||
    !existsSync(new URL(`${workspacePath}/Dockerfile`, root))
  ) {
    continue;
  }
  const app = workspacePath.slice("apps/".length);
  test(`${app}: frozen, selected install precedes source and revision`, () => {
    const dockerfile = read(`${workspacePath}/Dockerfile`);
    assert.doesNotMatch(dockerfile, /package-lock\.json|\bnpm (?:ci|prune)\b/);
    assert.doesNotMatch(dockerfile, /^COPY .*?\s\. \.\s*$/m);
    const install = [...dockerfile.matchAll(/^RUN pnpm (.+\binstall\b.*)$/gm)];
    assert.ok(install.length > 0);
    assert.match(
      dockerfile.slice(0, install[0].index),
      /^ENV PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE=false$/m,
    );
    for (const [, args] of install) {
      assert.ok(args.startsWith(`--filter ${name}... `), args);
      assert.match(args, / --frozen-lockfile\b/);
      assert.match(args, / --config\.enable-global-virtual-store=false(?: |$)/);
    }
    assert.equal(
      install.some(([, args]) => args.includes("--filter . ")),
      rootToolsApps.has(app),
    );
    assert.equal(
      install.some(([, args]) => args.includes("--prod")),
      productionApps.has(app),
    );

    const prefix = dockerfile.slice(0, install.at(-1).index);
    assert.ok(
      prefix.includes(
        `RUN npm install --global --ignore-scripts ${packageManager}\n`,
      ),
    );
    assert.ok(
      prefix.includes(
        "COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ",
      ),
    );
    const manifests = [
      ...prefix.matchAll(/^COPY ((?:apps|packages)\/[^/]+)\/package\.json /gm),
    ]
      .map((match) => match[1])
      .toSorted((a, b) => a.localeCompare(b));
    assert.deepEqual(manifests, selectedWorkspaces(workspace));
    assert.doesNotMatch(prefix, /^COPY (?:apps|packages)\/[^/\s]+ /m);
    assert.doesNotMatch(
      prefix,
      /^ARG (?:APP_REVISION|VCS_REF|HARRHY_\w+_VERSION)\b/m,
    );
    if (app === "radio") {
      assert.ok(
        prefix.includes(
          "COPY apps/radio/scripts/sync-icon-font.mjs ./apps/radio/scripts/",
        ),
      );
    } else {
      assert.ok(!dockerfile.includes("apps/radio"));
    }

    const runtime = dockerfile.slice(dockerfile.lastIndexOf("\nFROM "));
    assert.doesNotMatch(runtime, /^COPY --from=\S+ .*\/app \/app$/m);
    if (!bundledApps.has(app)) {
      assert.ok(runtime.includes("/app/node_modules "), "virtual store");
      for (const path of manifests) {
        assert.ok(
          runtime.includes(`/app/${path} `),
          `runtime importer: ${path}`,
        );
      }
    }
    if (celldApps.has(app)) {
      assert.match(runtime, /\/app\/tsconfig\.base\.json \/app\//);
      assert.doesNotMatch(runtime, /--from=production-dependencies/);
    }
    if (["cms", "maps-service", "maps-compiler"].includes(app)) {
      assert.match(runtime, /\/app\/tsconfig\.base\.json \/app\//);
      assert.match(
        runtime,
        /--from=production-dependencies .*\/app\/node_modules/,
      );
      assert.doesNotMatch(dockerfile, /better-sqlite3/);
    }
  });
}

test("local task worktrees never enter the Docker context", () => {
  assert.ok(read(".dockerignore").split("\n").includes(".worktrees"));
});
