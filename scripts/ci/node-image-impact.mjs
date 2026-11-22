import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  copiesChangedInput,
  dependencyClosure,
  readManifests,
} from "./publish-impact.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
export const nodeImageApps = [
  "cms",
  "auth",
  "artbin",
  "letters-to-steve",
  "marky",
  "maps-service",
  "maps-compiler",
  "rotund",
  "8mb",
];

export const runtimeApps = [
  "garden",
  "harry-sluggers",
  "ref",
  "radio",
  "world",
  "worldview",
  "maps-collaboration",
  "burger",
  "gurgur",
  "pool",
  "lists",
];

// Image checks intentionally have stricter root gates than publication. Root
// scripts/config can bootstrap builds without being manifest dependencies.
export function selectNodeImages({
  apps = nodeImageApps,
  paths,
  beforeManifests,
  afterManifests,
  dockerfiles,
}) {
  if (!paths.length) return [];
  if (paths.some((path) => !/^(apps|packages)\/[^/]+\/.+/.test(path)))
    return [...apps];
  const workspaces = paths.map((path) => path.split("/").slice(0, 2).join("/"));
  if (
    workspaces.some(
      (workspace) =>
        !beforeManifests.has(workspace) && !afterManifests.has(workspace),
    )
  )
    return [...apps];
  return apps.filter((app) => {
    const dockerfile = dockerfiles[app];
    if (typeof dockerfile !== "string")
      throw new Error(`Missing Dockerfile for ${app}`);
    if (copiesChangedInput(dockerfile, paths)) return true;
    // The closure includes the app itself and app/package consumers. Both
    // revisions matter when a dependency is removed.
    return [beforeManifests, afterManifests].some((manifests) => {
      const closure = dependencyClosure(manifests, app);
      return workspaces.some((workspace) => closure.has(workspace));
    });
  });
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || "Git comparison failed");
  return result.stdout;
}

// Comparison and parse failures must run checks, never omit them.
export function selectNodeImagesFromCommits({
  apps = nodeImageApps,
  before,
  head = "HEAD",
  event,
  read = git,
  warn = console.warn,
}) {
  if (event === "workflow_dispatch" || !before || /^0+$/.test(before))
    return [...apps];
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
    if (paths.some((path) => !/^(apps|packages)\/[^/]+\/.+/.test(path)))
      return [...apps];
    return selectNodeImages({
      apps,
      paths,
      beforeManifests: readManifests(before, read),
      afterManifests: readManifests(head, read),
      dockerfiles: Object.fromEntries(
        apps.map((app) => [
          app,
          [before, head]
            .map((commit) => read(["show", `${commit}:apps/${app}/Dockerfile`]))
            .join("\n"),
        ]),
      ),
    });
  } catch (error) {
    warn(
      `Could not determine affected Node images; checking all: ${error.message}`,
    );
    return [...apps];
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const selected = selectNodeImagesFromCommits({
    apps: [...nodeImageApps, ...runtimeApps],
    before: process.env.BASE_SHA,
    head: process.env.HEAD_SHA || "HEAD",
    event: process.env.EVENT,
  });
  const output = `apps=${JSON.stringify(selected.filter((app) => nodeImageApps.includes(app)))}\nruntime=${JSON.stringify(selected.filter((app) => runtimeApps.includes(app)))}\n`;
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
}
