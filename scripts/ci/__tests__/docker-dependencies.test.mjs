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
const manifests = ["apps", "packages"].flatMap((directory) =>
  readdirSync(new URL(directory, root), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${directory}/${entry.name}/package.json`)
    .filter((path) => {
      try {
        read(path);
        return true;
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    }),
);

for (const app of apps) {
  test(`${app}: full-workspace dependencies precede source and revision inputs`, () => {
    const dockerfile = read(`apps/${app}/Dockerfile`);
    const install = dockerfile.indexOf("RUN npm ci");
    const source = dockerfile.indexOf("COPY . .");
    assert.ok(install > 0 && source > install);
    const prefix = dockerfile.slice(0, install);
    assert.ok(prefix.includes("COPY package.json package-lock.json .npmrc ./"));
    for (const path of manifests) {
      assert.ok(prefix.includes(`COPY ${path} ./`), `missing ${path}`);
    }
    assert.ok(
      prefix.includes(
        "COPY apps/radio/scripts/sync-icon-font.mjs ./apps/radio/scripts/",
      ),
    );
    assert.ok(!prefix.includes("ARG APP_REVISION"));
    assert.ok(!dockerfile.slice(install, source).includes("npm run build"));
    if (["cms", "maps-service", "maps-compiler"].includes(app)) {
      assert.ok(
        dockerfile
          .slice(install, source)
          .includes("--nodedir=/usr/local --jobs=2"),
      );
    }
  });
}

test("local task worktrees never enter the Docker context", () => {
  assert.ok(read(".dockerignore").split("\n").includes(".worktrees"));
});
