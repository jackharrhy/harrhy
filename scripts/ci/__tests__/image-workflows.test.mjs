import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  nodeImageApps,
  runtimeApps,
  selectNodeImagesFromCommits,
} from "../node-image-impact.mjs";

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

test("CI builds images only on manual dispatch and does not pull images on PRs", () => {
  assert.match(
    ci,
    /- id: node_images\n +if: github\.event_name == 'workflow_dispatch'/,
  );
  for (const output of ["apps", "runtime"]) {
    assert.ok(ci.includes(`steps.node_images.outputs.${output} || '[]'`));
  }
  for (const app of ["radio", "ref"]) {
    assert.ok(
      ci.includes(
        `github.event_name != 'pull_request' && needs.select.outputs.${app} == 'true'\n        run: |\n          set -eu\n          ${app}_celld_image=`,
      ),
    );
  }
});

test("every publishable image has a smoke check, run on the loaded image before pushing", () => {
  const workflow = readWorkflow("publish-images");
  const selected = execFileSync(
    process.execPath,
    [new URL("../publish-images.mjs", import.meta.url).pathname],
    {
      env: {
        ...process.env,
        EVENT: "push",
        BEFORE: "",
        GITHUB_SHA: "test-sha",
        GITHUB_OUTPUT: "",
      },
      encoding: "utf8",
    },
  );
  const published = JSON.parse(selected.slice("images=".length));
  assert.deepEqual(
    published.map(({ app }) => app).toSorted(),
    [...nodeImageApps, ...runtimeApps].toSorted(),
  );

  const build = workflow.indexOf("      - id: build");
  const smoke = workflow.indexOf(
    "      - name: Smoke the exact image before publication",
  );
  const login = workflow.indexOf("      - uses: docker/login-action@");
  const push = workflow.indexOf("      - name: Push verified image tags");
  assert.ok(build >= 0 && build < smoke && smoke < login && login < push);
  assert.match(workflow.slice(build, smoke), /load: true\n +push: false/);
  assert.match(
    workflow.slice(smoke, login),
    /IMAGE_ID: \$\{\{ steps\.build\.outputs\.imageid \}\}\n +run: node scripts\/ci\/smoke-image\.mjs "\$APP" "\$IMAGE_ID"/,
  );
  assert.match(
    workflow.slice(push),
    /docker tag "\$IMAGE_ID" "\$tag"\n +docker push "\$tag"/,
  );
  assert.doesNotMatch(workflow.slice(smoke), /always\(|continue-on-error:/);
});

test("Garden and Sluggers select an npmrc-only merge diff and falls back safely", (t) => {
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
  const select = (before, testedHead) =>
    selectNodeImagesFromCommits({
      apps: runtimeApps,
      before,
      head: testedHead,
      event: "pull_request",
      read: (args) => git(...args),
      warn: () => {},
    });
  for (const app of ["garden", "harry-sluggers"]) {
    assert.ok(select(base, head).includes(app));
    assert.ok(!select(base, base).includes(app));
    assert.ok(select("missing", head).includes(app));
  }
});

test("main push compares across failed and cancelled runs or has no baseline", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "ci-baseline-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=CI", "-c", "user.email=ci@example.invalid", ...args],
      {
        cwd,
        encoding: "utf8",
      },
    ).trim();
  git("init", "-qb", "main");
  const commits = ["success", "failure", "cancelled", "current"].map(
    (status) => {
      writeFileSync(join(cwd, status), status);
      git("add", status);
      git("commit", "-qm", status);
      return git("rev-parse", "HEAD");
    },
  );
  const output = join(cwd, "output");
  const script = new URL("../main-baseline.sh", import.meta.url).pathname;
  function baseline(candidate, head = commits[3]) {
    writeFileSync(output, "");
    execFileSync(
      "bash",
      [
        "-c",
        `gh() { [[ "$2" == *'branch=main&event=push&status=success&per_page=1' ]] && echo "$CANDIDATE"; }; source "$1"`,
        "test",
        script,
      ],
      {
        cwd,
        env: {
          ...process.env,
          CANDIDATE: candidate,
          GITHUB_SHA: head,
          GITHUB_OUTPUT: output,
          GITHUB_REPOSITORY: "example/repo",
        },
      },
    );
    return readFileSync(output, "utf8").trim();
  }
  const selected = baseline(commits[0]);
  assert.equal(selected, "sha=" + commits[0]);
  assert.deepEqual(
    git("diff", "--name-only", selected.slice(4), commits[3]).split("\n"),
    ["cancelled", "current", "failure"],
  );
  assert.equal(baseline(""), "");
  assert.equal(baseline(commits[3], commits[1]), "");
});

test("job plan emits only nonempty matrices and rejects invalid selector output", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "ci-job-plan-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const output = join(cwd, "outputs");
  const summary = join(cwd, "summary");
  const plan = (overrides = {}) => {
    writeFileSync(output, "");
    writeFileSync(summary, "");
    return spawnSync(
      process.execPath,
      [new URL("../plan-jobs.mjs", import.meta.url).pathname],
      {
        env: {
          ...process.env,
          CHECK: "false",
          NODE_APPS: "[]",
          RUNTIME_IMAGES: "[]",
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
          ...overrides,
        },
        encoding: "utf8",
      },
    );
  };
  const readOutputs = () =>
    Object.fromEntries(
      readFileSync(output, "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const [key, json] = line.split("=");
          return [key, JSON.parse(json)];
        }),
    );
  const empty = plan();
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(readOutputs(), {
    jobs: {
      check: false,
      "node-images": false,
      "selected-images": false,
    },
  });
  assert.match(
    readFileSync(summary, "utf8"),
    /Jobs omitted: check, node-images, selected-images/,
  );
  const selected = plan({
    CHECK: "true",
    NODE_APPS: '["maps-compiler"]',
    RUNTIME_IMAGES: '["garden","harry-sluggers","ref"]',
  });
  assert.equal(selected.status, 0, selected.stderr);
  assert.deepEqual(readOutputs(), {
    jobs: {
      check: true,
      "node-images": true,
      "selected-images": true,
    },
    node_matrix: { app: ["maps-compiler"] },
    runtime_matrix: {
      app: ["garden", "harry-sluggers", "ref"],
    },
  });
  for (const invalid of [
    { NODE_APPS: "" },
    { RUNTIME_IMAGES: "" },
    { NODE_APPS: '["unknown"]' },
  ]) {
    assert.equal(plan(invalid).status, 1);
    assert.equal(readFileSync(output, "utf8"), "");
  }
});

test("CI gate accepts only successful selected jobs and intentional skips", () => {
  const script = ci
    .split("\n  gate:")[1]
    .split("        run: |\n")[1]
    .replace(/^ {10}/gm, "");
  const jobPlan = {
    check: true,
    "node-images": true,
    "selected-images": false,
  };
  const needs = {
    select: { result: "success", outputs: { jobs: JSON.stringify(jobPlan) } },
    workflows: { result: "success" },
    ...Object.fromEntries(
      Object.entries(jobPlan).map(([job, selected]) => [
        job,
        { result: selected ? "success" : "skipped" },
      ]),
    ),
  };
  const gate = (overrides = {}) =>
    spawnSync("bash", ["-e", "-c", script], {
      env: {
        ...process.env,
        RESULTS: JSON.stringify({ ...needs, ...overrides }),
      },
    }).status;
  assert.equal(gate(), 0);
  for (const result of ["failure", "cancelled", "skipped"]) {
    assert.notEqual(gate({ select: { ...needs.select, result } }), 0);
    assert.notEqual(gate({ "node-images": { result } }), 0);
    assert.notEqual(gate({ workflows: { result } }), 0);
  }
  assert.notEqual(gate({ "selected-images": { result: "cancelled" } }), 0);
  for (const jobs of [
    undefined,
    "invalid",
    "{}",
    JSON.stringify({ ...jobPlan, check: "true" }),
  ]) {
    assert.notEqual(
      gate({ select: { result: "success", outputs: { jobs } } }),
      0,
    );
  }
});
