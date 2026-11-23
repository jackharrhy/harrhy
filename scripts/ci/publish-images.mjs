import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { selectFromCommits } from "./publish-impact.mjs";

const checkedApps = [
  "8mb",
  "artbin",
  "auth",
  "cms",
  "garden",
  "harry-sluggers",
  "letters-to-steve",
  "lists",
  "marky",
  "radio",
  "ref",
  "rotund",
  "world",
];
const games = ["pool", "burger", "gurgur"];
const worldview = [
  "worldview",
  "maps-service",
  "maps-collaboration",
  "maps-compiler",
];
const groups = [...checkedApps.map((app) => [app]), games, worldview];
const sharedPaths = new Set([
  ".dockerignore",
  ".npmrc",
  ".nvmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
]);
const revisionArgs = {
  "8mb": "VCS_REF",
  auth: "HARRHY_AUTH_VERSION",
  cms: "APP_REVISION",
  ref: "HARRHY_REF_VERSION",
};
const root = fileURLToPath(new URL("../..", import.meta.url));
const gitResults = new Map();
function readGit(args) {
  const key = JSON.stringify(args);
  if (!gitResults.has(key)) {
    gitResults.set(
      key,
      execFileSync("git", args, { cwd: root, encoding: "utf8" }),
    );
  }
  return gitResults.get(key);
}

function selectApps({ BEFORE: before, EVENT: event, IMAGE: image }, sha) {
  if (event === "workflow_dispatch") {
    if (!groups.flat().includes(image))
      throw new Error("Choose a publishable image");
    return [image];
  }
  if (event !== "push") throw new Error("Expected push or workflow_dispatch");
  if (!before || /^0+$/.test(before)) return groups.flat();

  let paths;
  try {
    paths = readGit(["diff", "--name-only", "--no-renames", "-z", before, sha])
      .split("\0")
      .filter(Boolean);
  } catch (error) {
    console.warn(
      "Could not determine affected publications; selecting all: " +
        error.message,
    );
    return groups.flat();
  }

  // Keep the old per-workflow path gates before running dependency selection.
  return groups.flatMap((apps) => {
    const usesCelld =
      apps === worldview ||
      apps.includes("radio") ||
      apps.includes("ref") ||
      apps.includes("world");
    const triggered = paths.some(
      (path) =>
        sharedPaths.has(path) ||
        path.startsWith("packages/") ||
        (path === "celld.json" && usesCelld) ||
        apps.some((app) => path.startsWith(`apps/${app}/`)),
    );
    return triggered
      ? selectFromCommits(apps, before, sha, event, readGit)
      : [];
  });
}

const sha = process.env.GITHUB_SHA || readGit(["rev-parse", "HEAD"]).trim();
const images = selectApps(process.env, sha).map((app) => {
  const name = app === "cms" ? "teacms" : app.replace(/^maps-/, "worldview-");
  const image = `ghcr.io/jackharrhy/${name}`;
  const revisionArg = games.includes(app) ? "APP_REVISION" : revisionArgs[app];
  const latest = `${image}:latest`;
  const revision = `${image}:sha-${sha}`;
  return {
    app,
    image,
    check: checkedApps.includes(app),
    build_args: revisionArg ? `${revisionArg}=${sha}` : "",
    tags: worldview.includes(app)
      ? `${revision},${latest}`
      : `${latest}\n${revision}`,
  };
});
const output = `images=${JSON.stringify(images)}\n`;
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, output);
else process.stdout.write(output);
