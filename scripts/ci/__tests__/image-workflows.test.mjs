import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const readWorkflow = (name) =>
  readFileSync(
    new URL(`../../../.github/workflows/${name}.yml`, import.meta.url),
    "utf8",
  );
const ci = readWorkflow("ci");

test("publication triggers on shared inputs copied by Garden", () => {
  const pushPaths = readWorkflow("publish-images").split(
    "  workflow_dispatch:",
  )[0];
  for (const input of [".npmrc", "tsconfig.base.json"]) {
    assert.ok(pushPaths.split("\n").includes(`      - ${input}`), input);
  }
});

test("PR image selectors use the tested merge SHA", () => {
  for (const id of ["node_images", "image_paths"]) {
    const step =
      ci.split(`        id: ${id}\n`)[1]?.split("\n      - ")[0] ??
      ci.split(`      - id: ${id}\n`)[1]?.split("\n      - ")[0];
    assert.ok(step?.includes("HEAD_SHA: ${{ github.sha }}"), id);
  }
});

test("Garden selects an npmrc-only merge diff and falls back safely", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "ci-image-workflows-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const run = (cmd, args, options) =>
    execFileSync(cmd, args, { cwd, encoding: "utf8", ...options }).trim();
  const git = (...args) =>
    run("git", [
      "-c",
      "user.name=CI",
      "-c",
      "user.email=ci@example.invalid",
      ...args,
    ]);
  const commit = (file) => {
    writeFileSync(join(cwd, file), "updated\n");
    git("add", file);
    git("commit", "-qm", file);
    return git("rev-parse", "HEAD");
  };
  git("init", "-qb", "main");
  const fork = commit("README.md");
  const base = commit("celld.json");
  git("checkout", "-qb", "pr", fork);
  commit(".npmrc");
  git("merge", "--no-edit", "main");
  const head = git("rev-parse", "HEAD");
  const script = ci
    .split("        id: image_paths\n")[1]
    .split("\n  check:")[0]
    .split("        run: |\n")[1]
    .replace(/^ {10}/gm, "");
  const output = join(cwd, "outputs");
  const select = (baseSha, headSha, event = "pull_request") => {
    writeFileSync(output, "");
    run("bash", ["-e", "-c", script], {
      env: {
        ...process.env,
        BASE_SHA: baseSha,
        HEAD_SHA: headSha,
        GITHUB_EVENT_NAME: event,
        GITHUB_OUTPUT: output,
      },
    });
    return readFileSync(output, "utf8").split("\n");
  };
  assert.ok(select(base, head).includes("garden=true"));
  assert.ok(select(base, base).includes("garden=false"));
  assert.ok(select("missing", head).includes("garden=true"));
  assert.ok(select(base, head, "push").includes("garden=false"));
});
