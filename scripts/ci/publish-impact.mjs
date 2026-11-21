import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { dependencyNames } from "./affected.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const globalInputs = new Set([
  ".dockerignore",
  ".nvmrc",
  ".npmrc",
  ".pnpmfile.cjs",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
]);
const npmInstallHooks = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
]);

function installsRoot(dockerfile, rootName) {
  return dockerfile
    .replace(/\\\r?\n/g, " ")
    .split(/\bRUN\b|\n|&&|;/)
    .some((command) => {
      if (/--ignore-scripts\b/.test(command)) return false;
      if (/\bpnpm\s+(?:.*\s)?install\b/.test(command)) {
        const filters = [
          ...command.matchAll(/(?:--filter|-F)(?:\s+|=)["']?([^\s"']+)/g),
        ];
        return (
          !filters.length ||
          filters.some(([, filter]) =>
            [".", "./", "{.}", rootName].includes(
              filter.replace(/\.\.\.$/, ""),
            ),
          )
        );
      }
      return (
        /\bnpm\s+(?:ci|install)\b/.test(command) &&
        !/--include-workspace-root=false\b/.test(command) &&
        (!/--workspace(?:\s|=)|\s-w(?:\s|=)/.test(command) ||
          /--include-workspace-root=true\b/.test(command))
      );
    });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  return value;
}

function equal(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

export function dependencyClosure(manifests, app) {
  const byName = new Map(
    [...manifests].map(([path, manifest]) => [manifest.name, path]),
  );
  const visited = new Set();
  const pending = ["", "apps/" + app];
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    const manifest = manifests.get(path);
    if (!manifest)
      throw new Error("Missing manifest: " + (path || "package.json"));
    visited.add(path);
    for (const name of dependencyNames(manifest)) {
      if (byName.has(name)) pending.push(byName.get(name));
    }
  }
  return visited;
}

export function copiesChangedInput(dockerfile, paths) {
  for (const line of dockerfile.replace(/\\\r?\n/g, " ").split("\n")) {
    if (!/^\s*(?:COPY|ADD)\s/i.test(line) || /--from[=\s]/i.test(line))
      continue;
    const args = line
      .trim()
      .split(/\s+/)
      .slice(1)
      .filter((arg) => !arg.startsWith("--"));
    const sources = args
      .slice(0, -1)
      .map((source) => source.replace(/^\.\//, ""));
    if (sources.some((source) => source === "." || source === "")) return true;
    if (
      !sources.length ||
      sources.some((source) => /[[\]"'$*?\\]/.test(source))
    )
      return true;
    if (
      sources.some((source) =>
        paths.some(
          (path) =>
            path === source || path.startsWith(`${source.replace(/\/$/, "")}/`),
        ),
      )
    )
      return true;
  }
  return false;
}

function changedRootScripts(before, after) {
  const names = new Set([
    ...Object.keys(before.scripts ?? {}),
    ...Object.keys(after.scripts ?? {}),
  ]);
  return [...names].filter(
    (name) => before.scripts?.[name] !== after.scripts?.[name],
  );
}

function rootWithoutScripts(manifest) {
  const { scripts: _scripts, ...rest } = manifest;
  return rest;
}

export function selectPublishedApps({
  apps,
  paths,
  beforeManifests,
  afterManifests,
  dockerfiles = {},
}) {
  if (paths.some((path) => globalInputs.has(path))) return apps;
  if (!paths.length) return [];
  const beforeRoot = beforeManifests.get("");
  const afterRoot = afterManifests.get("");
  const rootChanged = paths.includes("package.json");
  if (
    rootChanged &&
    !equal(rootWithoutScripts(beforeRoot), rootWithoutScripts(afterRoot))
  )
    return apps;

  const scripts = rootChanged ? changedRootScripts(beforeRoot, afterRoot) : [];
  const inputs = paths.filter((path) => path !== "package.json");
  return apps.filter((app) => {
    const dockerfile = dockerfiles[app] ?? "";
    if (paths.includes("celld.json") && /ARG CELLD_IMAGE=/.test(dockerfile))
      return true;
    if (inputs.length && copiesChangedInput(dockerfile, inputs)) return true;

    const workspaceScripts = [];
    for (const manifests of [beforeManifests, afterManifests]) {
      for (const path of dependencyClosure(manifests, app)) {
        if (!path) continue;
        if (inputs.some((input) => input.startsWith(path + "/"))) return true;
        if (scripts.length)
          workspaceScripts.push(
            ...Object.values(manifests.get(path).scripts ?? {}),
          );
      }
    }
    if (
      scripts.some((name) => {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const call = new RegExp(
          "\\b(?:npm|pnpm|bun)\\s+(?:[^\\n;&|]*?\\s+)?run\\s+" +
            escaped +
            "(?=$|[\\s;&|])",
        );
        return [dockerfile, ...workspaceScripts].some((source) =>
          call.test(source),
        );
      })
    )
      return true;
    return (
      scripts.some((name) => npmInstallHooks.has(name)) &&
      [beforeRoot.name, afterRoot.name].some((name) =>
        installsRoot(dockerfile, name),
      )
    );
  });
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || "Could not compare commits");
  return result.stdout;
}

export function readManifests(commit, read) {
  const paths = read([
    "ls-tree",
    "-r",
    "--name-only",
    "-z",
    commit,
    "--",
    "apps",
    "packages",
  ])
    .split("\0")
    .filter((path) => /^(apps|packages)\/[^/]+\/package\.json$/.test(path));
  return new Map(
    ["package.json", ...paths].map((path) => {
      const manifest = JSON.parse(read(["show", commit + ":" + path]));
      if (!manifest || typeof manifest.name !== "string" || !manifest.name)
        throw new Error("Invalid manifest: " + commit + ":" + path);
      return [path.slice(0, -"/package.json".length), manifest];
    }),
  );
}

export function selectFromCommits(
  apps,
  before,
  head,
  event,
  read = git,
  warn = console.warn,
) {
  if (event === "workflow_dispatch" || !before || /^0+$/.test(before))
    return apps;
  try {
    const paths = read([
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      before,
      head,
    ])
      .split("\0")
      .filter(Boolean);
    if (!paths.length) return [];
    if (paths.some((path) => globalInputs.has(path))) return apps;
    return selectPublishedApps({
      apps,
      paths,
      beforeManifests: readManifests(before, read),
      afterManifests: readManifests(head, read),
      dockerfiles: Object.fromEntries(
        apps.map((app) => [
          app,
          [before, head]
            .map((commit) =>
              read(["show", commit + ":apps/" + app + "/Dockerfile"]),
            )
            .join("\n"),
        ]),
      ),
    });
  } catch (error) {
    warn(
      "Could not determine affected publications; selecting all: " +
        error.message,
    );
    return apps;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const apps = process.argv.slice(2);
  if (!apps.length) throw new Error("Pass at least one app");
  const selected = selectFromCommits(
    apps,
    process.env.BEFORE,
    process.env.GITHUB_SHA || "HEAD",
    process.env.EVENT,
  );
  const output = `apps=${JSON.stringify(selected)}\n`;
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
}
