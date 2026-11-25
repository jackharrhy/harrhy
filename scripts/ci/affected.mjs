import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

export function loadWorkspaces(directory = root) {
  return ["apps", "packages", "experiments"].flatMap((group) =>
    (
      readdirSync(join(directory, group), {
        withFileTypes: true,
        throwIfNoEntry: false,
      }) ?? []
    )
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const path = `${group}/${entry.name}`;
        try {
          const manifest = JSON.parse(
            readFileSync(join(directory, path, "package.json"), "utf8"),
          );
          return [{ path, name: manifest.name, manifest }];
        } catch (error) {
          if (error.code === "ENOENT") return [];
          throw error;
        }
      }),
  );
}

export function dependencyNames(manifest) {
  return [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ].flatMap((field) => Object.keys(manifest[field] ?? {}));
}

export function selectChecks(paths, workspaces) {
  const all = workspaces
    .filter(({ manifest }) => manifest.scripts?.check)
    .map(({ name }) => name)
    .toSorted();
  const byPath = workspaces.toSorted((a, b) => b.path.length - a.path.length);
  const affected = new Set();

  for (const path of paths) {
    if (path === "celld.json" || path === "scripts/celld-runtime.mjs") {
      for (const name of [
        "@harrhy/ref",
        "@harrhy/radio",
        "@harrhy/world",
        "@harrhy/worldview",
        "@harrhy/maps-collaboration",
        "@harrhy/4orm",
      ]) {
        affected.add(name);
      }
      continue;
    }
    if (
      path === "README.md" ||
      path === "AGENTS.md" ||
      path === ".dockerignore" ||
      path === ".github/workflows/lint-actions.yml" ||
      path.startsWith(".github/workflows/publish-") ||
      path === ".github/dependabot.yml" ||
      path === ".github/dependabot.yaml" ||
      // The select job runs these tests; image jobs own the image scripts.
      /^scripts\/ci\/__tests__\/[^/]+\.test\.mjs$/.test(path) ||
      path === "scripts/ci/node-image-impact.mjs" ||
      path === "scripts/ci/node-image-smoke.mjs" ||
      path === "scripts/ci/selected-image-smoke.mjs" ||
      path === "scripts/ci/publish-images.mjs" ||
      path === "scripts/ci/publish-impact.mjs" ||
      path.endsWith("/Dockerfile") ||
      path.startsWith("docs/")
    )
      continue;
    const workspace = byPath.find(
      (item) => path === item.path || path.startsWith(`${item.path}/`),
    );
    if (workspace) {
      if (path.endsWith("/README.md") || path.endsWith("/AGENTS.md")) continue;
      affected.add(workspace.name);
      continue;
    }
    return all;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const { name, manifest } of workspaces) {
      if (affected.has(name)) continue;
      if (
        dependencyNames(manifest).some((dependency) => affected.has(dependency))
      ) {
        affected.add(name);
        changed = true;
      }
    }
  }

  return all.filter((name) => affected.has(name));
}

export function planChecks(selected, workspaces) {
  const byName = new Map(
    workspaces.map((workspace) => [workspace.name, workspace]),
  );
  const selectedNames = new Set(selected);
  const visiting = new Set();
  const planned = new Set();
  const plan = [];

  function visit(name) {
    if (planned.has(name)) return;
    if (visiting.has(name))
      throw new Error(`Workspace dependency cycle at ${name}`);
    const workspace = byName.get(name);
    if (!workspace) throw new Error(`Unknown workspace ${name}`);
    visiting.add(name);
    for (const dependency of dependencyNames(workspace.manifest)
      .filter((candidate) => byName.has(candidate))
      .toSorted())
      visit(dependency);
    visiting.delete(name);
    planned.add(name);
    if (selectedNames.has(name)) {
      if (!workspace.manifest.scripts?.check)
        throw new Error(`No check script for ${name}`);
      plan.push({ name, script: "check" });
    } else if (workspace.manifest.scripts?.build) {
      plan.push({ name, script: "build" });
    }
  }

  for (const name of [...selectedNames].toSorted((a, b) => a.localeCompare(b)))
    visit(name);
  return plan;
}

function changedPaths(base, head) {
  if (!base || /^0+$/.test(base)) throw new Error("No usable base commit");
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", base, head],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || "Could not compare commits");
  return result.stdout.split("\0").filter(Boolean);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let checks;
  try {
    const paths = changedPaths(
      process.env.BASE_SHA,
      process.env.HEAD_SHA || "HEAD",
    );
    checks = selectChecks(paths, loadWorkspaces());
  } catch (error) {
    console.warn(`Could not determine affected workspaces: ${error.message}`);
    checks = selectChecks(["pnpm-lock.yaml"], loadWorkspaces());
  }
  console.log(`Affected checks: ${JSON.stringify(checks)}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    let report = "Unavailable: no comparable checkout/base.";
    const base = process.env.BASE_SHA;
    if (base && process.env.HEAD_SHA === process.env.GITHUB_SHA) {
      const result = spawnSync(
        "pnpm",
        ["--filter", `...[${base}]`, "list", "--depth", "-1", "--json"],
        { cwd: root, encoding: "utf8", timeout: 30000 },
      );
      try {
        if (result.status !== 0) throw new Error("filter failed");
        const names = new Set(JSON.parse(result.stdout).map((pkg) => pkg.name));
        const shadow = loadWorkspaces()
          .filter(
            ({ name, manifest }) => names.has(name) && manifest.scripts?.check,
          )
          .map((pkg) => pkg.name)
          .toSorted((a, b) => a.localeCompare(b));
        report = `Legacy only: ${JSON.stringify(checks.filter((name) => !shadow.includes(name)))}\n\npnpm only: ${JSON.stringify(shadow.filter((name) => !checks.includes(name)))}`;
      } catch {
        report = "Unavailable: pnpm filter failed.";
      }
    }
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### pnpm affected shadow (advisory)\n${report}\n\n`,
    );
  }
  const mapsHosted = [
    "@harrhy/worldview",
    "@harrhy/maps-service",
    "@harrhy/maps-collaboration",
    "@harrhy/maps-editor",
    "@harrhy/worldview-renderer",
    "@harrhy/maps-protocol",
  ].some((name) => checks.includes(name));
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `selected=${JSON.stringify(checks)}\nany=${checks.length > 0}\nbrowser=${mapsHosted || ["@harrhy/ui-app", "@harrhy/cms", "@harrhy/ref", "@harrhy/radio", "@harrhy/burger"].some((name) => checks.includes(name))}\ncms=${checks.includes("@harrhy/cms")}\nref=${checks.includes("@harrhy/ref")}\nradio=${checks.includes("@harrhy/radio")}\npool=${checks.includes("@harrhy/pool-app")}\nburger=${checks.includes("@harrhy/burger")}\ngurgur=${checks.includes("@harrhy/gurgur")}\nmaps_hosted=${mapsHosted}\n`,
    );
}
