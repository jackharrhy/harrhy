import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadWorkspaces } from "../affected.mjs";
import {
  nodeImageApps,
  selectNodeImages,
  selectNodeImagesFromCommits,
} from "../node-image-impact.mjs";

const broad = ["cms", "maps-service", "maps-compiler"];
function fixture() {
  const beforeManifests = new Map([
    ["", { name: "root" }],
    ...nodeImageApps.map((app) => ["apps/" + app, { name: app }]),
    ["apps/unrelated", { name: "unrelated" }],
    ["packages/shared", { name: "shared" }],
    [
      "packages/bridge",
      { name: "bridge", peerDependencies: { shared: "workspace:*" } },
    ],
    ["packages/extra-copy", { name: "extra-copy" }],
  ]);
  beforeManifests.get("apps/auth").optionalDependencies = {
    bridge: "workspace:*",
  };
  return {
    beforeManifests,
    afterManifests: structuredClone(beforeManifests),
    dockerfiles: Object.fromEntries(
      nodeImageApps.map((app) => [
        app,
        broad.includes(app) ? "COPY . ." : `COPY apps/${app} ./apps/${app}`,
      ]),
    ),
  };
}
const ordered = (...apps) => nodeImageApps.filter((app) => apps.includes(app));

test("app-only changes avoid unrelated narrow images but retain whole-context images", () => {
  const f = fixture();
  f.dockerfiles["8mb"] = "FROM node";
  assert.deepEqual(
    selectNodeImages({ ...f, paths: ["apps/8mb/server.ts"] }),
    ordered(...broad, "8mb"),
  );
  assert.deepEqual(
    selectNodeImages({ ...fixture(), paths: ["apps/unrelated/source.ts"] }),
    broad,
  );
});

test("shared source reaches transitive consumers from either manifest revision", () => {
  for (const removed of [false, true]) {
    const f = fixture();
    if (removed) delete f.afterManifests.get("apps/auth").optionalDependencies;
    else delete f.beforeManifests.get("apps/auth").optionalDependencies;
    assert.deepEqual(
      selectNodeImages({ ...f, paths: ["packages/shared/index.ts"] }),
      ordered(...broad, "auth"),
    );
  }
});

test("mixed inputs union consumers, while empty diffs select no images", () => {
  assert.deepEqual(
    selectNodeImages({
      ...fixture(),
      paths: ["packages/shared/index.ts", "apps/rotund/src/server.ts"],
    }),
    ordered(...broad, "auth", "rotund"),
  );
  assert.deepEqual(selectNodeImages({ paths: [] }), []);
});

test("root runtime, bootstrap, configuration and unknown inputs check every image", () => {
  for (const path of [
    ".nvmrc",
    "package-lock.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "scripts/tooling/ensure-worker-types.mjs",
    ".github/workflows/node-images.yml",
    "new-root-input",
    "apps/new-unknown/source.ts",
  ])
    assert.deepEqual(
      selectNodeImages({ ...fixture(), paths: [path] }),
      nodeImageApps,
      path,
    );
});

test("explicit Docker COPY outside the manifest graph is an image input", () => {
  const f = fixture();
  f.dockerfiles.marky += "\nCOPY packages/extra-copy ./extra";
  assert.deepEqual(
    selectNodeImages({ ...f, paths: ["packages/extra-copy/file.ts"] }),
    ordered(...broad, "marky"),
  );
  for (const copy of [
    'COPY ["packages/extra-copy", "./extra"]',
    "COPY ${EXTRA} ./extra",
    "COPY packages/* ./packages",
  ]) {
    f.dockerfiles.marky = copy;
    assert.deepEqual(
      selectNodeImages({ ...f, paths: ["apps/unrelated/file.ts"] }),
      ordered(...broad, "marky"),
    );
  }
});

test("comparison reads both Dockerfile revisions and falls back on errors", () => {
  const f = fixture();
  const reads = [];
  const read = (args) => {
    reads.push(args);
    if (args[0] === "diff") return "apps/unrelated/file.ts\0";
    const [commit, path] = args[1].split(":");
    if (args[0] === "ls-tree")
      return [...f.beforeManifests.keys()]
        .filter(Boolean)
        .map((path) => path + "/package.json")
        .join("\0");
    if (path.endsWith("package.json"))
      return JSON.stringify(
        f.beforeManifests.get(path.slice(0, -"/package.json".length)),
      );
    const app = path.split("/")[1];
    return app === "marky" && commit === "base"
      ? "COPY . ."
      : f.dockerfiles[app];
  };
  assert.deepEqual(
    selectNodeImagesFromCommits({ before: "base", head: "head", read }),
    ordered(...broad, "marky"),
  );
  assert.ok(
    reads.some((args) => args.includes("--no-renames") && args.includes("-z")),
  );
  for (const failingRead of [
    () => {
      throw new Error("missing base");
    },
    (args) => (args[0] === "diff" ? "apps/auth/index.ts\0" : "not json"),
  ]) {
    const warnings = [];
    assert.deepEqual(
      selectNodeImagesFromCommits({
        before: "base",
        read: failingRead,
        warn: (text) => warnings.push(text),
      }),
      nodeImageApps,
    );
    assert.equal(warnings.length, 1);
  }
});

function unexpectedRead() {
  throw new Error("must not read");
}

function malformedManifestRead(args) {
  if (args[0] === "diff") return "apps/auth/src/server.mjs\0";
  if (args[0] === "ls-tree") return "apps/auth/package.json\0";
  return "{}";
}

test("manual, missing and zero bases check all without comparing; no diff is a noop", () => {
  for (const args of [
    { event: "workflow_dispatch", before: "base" },
    {},
    { before: "0000" },
  ])
    assert.deepEqual(
      selectNodeImagesFromCommits({ ...args, read: unexpectedRead }),
      nodeImageApps,
    );
  assert.deepEqual(
    selectNodeImagesFromCommits({ before: "base", read: () => "" }),
    [],
  );
});

test("malformed manifest data conservatively checks every image through the entry point", () => {
  assert.deepEqual(
    selectNodeImagesFromCommits({
      before: "base",
      read: malformedManifestRead,
      warn: () => {},
    }),
    nodeImageApps,
  );
});

test("repository selected Dockerfiles check actual UI consumers without unrelated apps", () => {
  const root = new URL("../../../", import.meta.url);
  const manifests = new Map([
    ["", JSON.parse(readFileSync(new URL("package.json", root), "utf8"))],
    ...loadWorkspaces(fileURLToPath(root)).map(({ path, manifest }) => [
      path,
      manifest,
    ]),
  ]);
  const dockerfiles = Object.fromEntries(
    nodeImageApps.map((app) => [
      app,
      readFileSync(new URL(`apps/${app}/Dockerfile`, root), "utf8"),
    ]),
  );
  assert.deepEqual(
    selectNodeImages({
      paths: ["packages/ui/styles.ts"],
      beforeManifests: manifests,
      afterManifests: manifests,
      dockerfiles,
    }),
    ordered("cms", "auth", "artbin"),
  );
});
