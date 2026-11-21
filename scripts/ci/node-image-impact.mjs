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

// Image checks intentionally have stricter root gates than publication. Root
// scripts/config can bootstrap builds without being manifest dependencies.
export function selectNodeImages({
  paths,
  beforeManifests,
  afterManifests,
  dockerfiles,
}) {
  if (!paths.length) return [];
  if (paths.some((path) => !/^(apps|packages)\/[^/]+\/.+/.test(path)))
    return [...nodeImageApps];
  const workspaces = paths.map((path) => path.split("/").slice(0, 2).join("/"));
  if (
    workspaces.some(
      (workspace) =>
        !beforeManifests.has(workspace) && !afterManifests.has(workspace),
    )
  )
    return [...nodeImageApps];
  return nodeImageApps.filter((app) => {
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
  before,
  head = "HEAD",
  event,
  read = git,
  warn = console.warn,
}) {
  if (event === "workflow_dispatch" || !before || /^0+$/.test(before))
    return [...nodeImageApps];
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
      return [...nodeImageApps];
    return selectNodeImages({
      paths,
      beforeManifests: readManifests(before, read),
      afterManifests: readManifests(head, read),
      dockerfiles: Object.fromEntries(
        nodeImageApps.map((app) => [
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
    return [...nodeImageApps];
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const selected = selectNodeImagesFromCommits({
    before: process.env.BASE_SHA,
    head: process.env.HEAD_SHA || "HEAD",
    event: process.env.EVENT,
  });
  const output = `apps=${JSON.stringify(selected)}\n`;
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
}
