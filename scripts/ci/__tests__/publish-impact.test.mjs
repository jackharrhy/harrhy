import assert from "node:assert/strict";
import test from "node:test";
import { selectFromCommits, selectPublishedApps } from "../publish-impact.mjs";

const apps = ["ref", "artbin"];
const beforeManifests = new Map([
  [
    "",
    {
      name: "harrhy",
      scripts: { postinstall: "node old.mjs", "ref:build": "node old.mjs" },
    },
  ],
  [
    "apps/ref",
    { name: "@harrhy/ref", dependencies: { "@harrhy/bridge": "workspace:*" } },
  ],
  ["apps/artbin", { name: "@harrhy/artbin-app" }],
  [
    "packages/bridge",
    {
      name: "@harrhy/bridge",
      peerDependencies: { "@harrhy/ui": "workspace:*" },
    },
  ],
  ["packages/ui", { name: "@harrhy/ui" }],
]);

function select(paths, { afterManifests = beforeManifests, dockerfiles } = {}) {
  return selectPublishedApps({
    apps,
    paths,
    beforeManifests,
    afterManifests,
    dockerfiles,
  });
}

function changeRoot(change) {
  const after = structuredClone(beforeManifests);
  Object.assign(after.get(""), change);
  return after;
}

test("root lock and manager config changes select all without reading manifests", () => {
  for (const path of [
    "package-lock.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".npmrc",
    ".pnpmfile.cjs",
    ".nvmrc",
  ]) {
    assert.deepEqual(
      selectFromCommits(
        apps,
        "base",
        "head",
        "push",
        (args) => {
          assert.equal(args[0], "diff");
          return path + "\0";
        },
        assert.fail,
      ),
      apps,
    );
  }
  assert.deepEqual(
    select(["package.json"], {
      afterManifests: changeRoot({ packageManager: "pnpm@10.0.0" }),
    }),
    apps,
  );
});

test("workspace source reaches transitive consumers from either revision", () => {
  const afterManifests = structuredClone(beforeManifests);
  afterManifests.delete("packages/bridge");
  assert.deepEqual(select(["packages/ui/styles.ts"], { afterManifests }), [
    "ref",
  ]);
  assert.deepEqual(
    selectPublishedApps({
      apps,
      paths: ["packages/ui/styles.ts"],
      beforeManifests: afterManifests,
      afterManifests: beforeManifests,
    }),
    ["ref"],
  );
  assert.deepEqual(select(["apps/artbin/src/server.ts"]), ["artbin"]);
  assert.deepEqual(select(["apps/auth/src/server.ts"]), []);
});

test("Docker context inputs include non-dependencies but not stage copies", () => {
  assert.deepEqual(
    select(["apps/auth/src/server.ts"], {
      dockerfiles: {
        ref: "COPY apps/auth /auth",
        artbin: "COPY --from=build apps/auth /auth",
      },
    }),
    ["ref"],
  );
  assert.deepEqual(
    select(["celld.json"], {
      dockerfiles: { ref: "ARG CELLD_IMAGE=example" },
    }),
    ["ref"],
  );
});

test("changed root scripts match npm and pnpm calls in Dockerfiles or workspaces", () => {
  const afterManifests = changeRoot({
    scripts: {
      ...beforeManifests.get("").scripts,
      "ref:build": "node new.mjs",
    },
  });
  for (const command of ["npm run ref:build", "pnpm -w run ref:build"]) {
    assert.deepEqual(
      select(["package.json"], {
        afterManifests,
        dockerfiles: {
          ref: "RUN " + command,
          artbin: "RUN pnpm run ref:build:other",
        },
      }),
      ["ref"],
    );
  }
  afterManifests.get("apps/ref").scripts = {
    build: "pnpm --filter . run ref:build",
  };
  assert.deepEqual(select(["package.json"], { afterManifests }), ["ref"]);
});

test("changed install hooks select root installs only, unless scripts are disabled", () => {
  const afterManifests = changeRoot({
    scripts: {
      ...beforeManifests.get("").scripts,
      postinstall: "node new.mjs",
    },
  });
  for (const [rootInstall, filteredInstall] of [
    [
      "npm ci",
      "npm ci --workspace @harrhy/artbin-app --include-workspace-root=false",
    ],
    [
      "npm ci --workspace @harrhy/ref --include-workspace-root=true",
      "npm ci --ignore-scripts",
    ],
    [
      "pnpm --filter @harrhy/ref... --filter . install --frozen-lockfile",
      "pnpm --filter @harrhy/artbin-app... install",
    ],
    [
      "pnpm install --frozen-lockfile",
      "pnpm --filter . install --ignore-scripts",
    ],
  ]) {
    assert.deepEqual(
      select(["package.json"], {
        afterManifests,
        dockerfiles: {
          ref: "RUN " + rootInstall,
          artbin: "RUN " + filteredInstall,
        },
      }),
      ["ref"],
    );
  }
});

test("invalid comparisons select all with a warning; manual runs do not compare", () => {
  assert.deepEqual(
    selectFromCommits(apps, "base", "head", "workflow_dispatch", assert.fail),
    apps,
  );
  const warnings = [];
  assert.deepEqual(
    selectFromCommits(
      apps,
      "base",
      "head",
      "push",
      () => {
        throw new Error("missing base");
      },
      (warning) => warnings.push(warning),
    ),
    apps,
  );
  assert.match(warnings[0], /missing base/);
});
