import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const apps = [
  "ref",
  "radio",
  "worldview",
  "maps-collaboration",
  "cms",
  "maps-service",
  "maps-compiler",
  "burger",
  "gurgur",
  "pool",
];
const workspaces = new Map();
for (const directory of ["apps", "packages"]) {
  for (const entry of readdirSync(new URL(directory, root), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const path = `${directory}/${entry.name}`;
    try {
      const manifest = JSON.parse(read(`${path}/package.json`));
      workspaces.set(manifest.name, { path, manifest });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function selectedWorkspaces(app) {
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
  visit({
    path: `apps/${app}`,
    manifest: JSON.parse(read(`apps/${app}/package.json`)),
  });
  return [...selected].toSorted((a, b) => a.localeCompare(b));
}

for (const app of apps) {
  test(`${app}: only selected workspace inputs precede source and revision`, () => {
    const dockerfile = read(`apps/${app}/Dockerfile`);
    const install = dockerfile.indexOf("RUN npm ci");
    const source = dockerfile.indexOf(`COPY apps/${app} ./apps/${app}`);
    assert.ok(install > 0 && source > install);
    assert.ok(!dockerfile.includes("COPY . ."));
    const prefix = dockerfile.slice(0, install);
    assert.ok(prefix.includes("COPY package.json package-lock.json .npmrc ./"));
    const manifests = [
      ...prefix.matchAll(/^COPY ((?:apps|packages)\/[^/]+)\/package\.json /gm),
    ]
      .map((match) => match[1])
      .toSorted((a, b) => a.localeCompare(b));
    assert.deepEqual(manifests, selectedWorkspaces(app));
    assert.ok(!prefix.includes("ARG APP_REVISION"));
    assert.ok(!dockerfile.slice(install, source).includes("npm run build"));
    const name = JSON.parse(read(`apps/${app}/package.json`)).name;
    assert.ok(
      dockerfile.includes(
        `npm ci --workspace ${name} --include-workspace-root=`,
      ),
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
    if (!["burger", "gurgur", "pool"].includes(app)) {
      assert.ok(runtime.includes("/app/tsconfig.base.json /app/"));
      assert.ok(!runtime.includes("COPY --from=build /app /app"));
      for (const path of selectedWorkspaces(app)) {
        assert.ok(runtime.includes(`/app/${path} /app/${path}`), path);
      }
    }
    if (["cms", "maps-service", "maps-compiler"].includes(app)) {
      assert.ok(
        dockerfile.includes(
          `npm prune --omit=dev --workspace ${name} --include-workspace-root=true`,
        ),
      );
      assert.ok(!dockerfile.includes("better-sqlite3"));
    }
    if (["ref", "radio", "worldview", "maps-collaboration"].includes(app)) {
      assert.ok(
        !dockerfile.includes("--omit=dev"),
        "startup compiler/Azure must survive",
      );
    }
  });
}

test("local task worktrees never enter the Docker context", () => {
  assert.ok(read(".dockerignore").split("\n").includes(".worktrees"));
});
