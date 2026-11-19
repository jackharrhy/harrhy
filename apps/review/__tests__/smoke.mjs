import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { get } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { chromium, expect } from "@playwright/test";
import { verifyCelldBinary } from "../../../scripts/celld-runtime.mjs";

const binary = process.env.HARRHY_REVIEW_CELLD_BIN;
assert.ok(binary, "Set HARRHY_REVIEW_CELLD_BIN to the qualified binary");
await verifyCelldBinary(binary);
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const { port } = probe.address();
await promisify(probe.close.bind(probe))();
const origin = `http://127.0.0.1:${port}`;
const root = await mkdtemp(join(tmpdir(), "harrhy-review-smoke-"));
const project = join(root, "app");
const repo = join(root, "repo");
const run = promisify(execFile);
const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
const cli = async (...args) =>
  JSON.parse(
    (
      await run(process.execPath, [resolve("cli.mjs"), ...args], {
        env: { ...process.env, HARRHY_REVIEW_ORIGIN: origin },
      })
    ).stdout,
  );
let child;
let browser;
async function start() {
  const logs = [];
  child = spawn(
    resolve(binary),
    [
      "dev",
      project,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--no-watch",
    ],
    {
      env: {
        ...process.env,
        CELLD_ESBUILD: resolve("../../node_modules/.bin/esbuild"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => logs.push(chunk));
  child.stderr.on("data", (chunk) => logs.push(chunk));
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) break;
    try {
      if (
        (
          await fetch(`${origin}/api/reviews`, {
            signal: AbortSignal.timeout(500),
          })
        ).ok
      )
        return;
    } catch {}
    await delay(100);
  }
  throw new Error(Buffer.concat(logs).toString());
}
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const done = once(child, "exit");
    child.kill();
    await done;
  }
  child = undefined;
}

try {
  await mkdir(project);
  await mkdir(repo);
  await cp("dist", join(project, "dist"), { recursive: true });
  await cp("wrangler.jsonc", join(project, "wrangler.jsonc"));
  await writeFile(
    join(project, ".dev.vars"),
    `HARRHY_REVIEW_ORIGIN=${origin}
`,
  );
  git("init", "-b", "main");
  git("config", "user.name", "Synthetic Reviewer");
  git("config", "user.email", "reviewer@example.invalid");
  git("config", "core.hooksPath", join(root, "disabled-hooks"));
  const source = join(repo, "demo.ts");
  await writeFile(source, 'export const color = "blue";\n');
  git("add", ".");
  git("commit", "-m", "Initial");
  const fork = git("rev-parse", "HEAD");
  git("branch", "example");
  await writeFile(join(repo, "base-only.txt"), "this must not appear\n");
  git("add", ".");
  git("commit", "-m", "Advance base independently");
  git("switch", "example");
  await writeFile(source, 'export const color = "green";\n');
  git("add", ".");
  git("commit", "-m", "Change demo");

  await start();
  const wrongHost = await new Promise((done, reject) => {
    get(
      `${origin}/api/reviews`,
      { headers: { Host: "example.invalid" } },
      (response) => {
        response.resume();
        done(response.statusCode);
      },
    ).on("error", reject);
  });
  assert.equal(wrongHost, 403);
  assert.equal(
    (
      await fetch(`${origin}/api/reviews`, {
        headers: { Origin: "https://example.invalid" },
      })
    ).status,
    403,
  );
  const { id, url } = await cli(
    "submit",
    "--repo",
    repo,
    "--base",
    "main",
    "--head",
    "example",
    "--json",
  );
  const api = `${origin}/api/reviews/${id}`;
  const initial = await (await fetch(api)).json();
  assert.equal(initial.title, "Change demo");
  assert.equal(initial.fileCount, 1);
  assert.deepEqual(initial.viewedFiles, []);
  const setViewed = (file, viewed) =>
    fetch(`${api}/viewed`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Harrhy-Review": "1" },
      body: JSON.stringify({ file, viewed }),
    });
  assert.equal((await setViewed(1, true)).status, 400);
  assert.equal(initial.mergeBase, fork);
  const { id: namedId } = await cli(
    "submit",
    "--repo",
    repo,
    "--base",
    "main",
    "--head",
    "example",
    "--title",
    "  Named comparison  ",
    "--json",
  );
  const { base, head, mergeBase, patch } = initial;
  const headers = {
    "content-type": "application/json",
    "x-harrhy-review": "1",
  };
  const legacyResponse = await fetch(`${origin}/api/reviews`, {
    method: "POST",
    headers,
    body: JSON.stringify({ base, head, mergeBase, patch }),
  });
  assert.equal(legacyResponse.status, 201);
  const { id: legacyId } = await legacyResponse.json();
  assert.equal(
    (await (await fetch(`${origin}/api/reviews/${legacyId}`)).json()).title,
    "Untitled review",
  );
  assert.equal(
    (await fetch(api, { method: "PATCH", body: '{"title":"Blocked"}' })).status,
    403,
  );
  for (const title of ["   ", "two\nlines", "x".repeat(121)]) {
    assert.equal(
      (
        await fetch(api, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ title }),
        })
      ).status,
      400,
    );
  }
  assert.doesNotMatch(initial.patch, /base-only/);
  assert.equal((await fetch(api, { method: "DELETE" })).status, 403);
  assert.equal(
    (
      await fetch(`${api}/threads`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-harrhy-review": "1" },
        body: JSON.stringify({
          file: 0,
          side: "new",
          line: 10000,
          text: "Invalid anchor",
        }),
      })
    ).status,
    400,
  );
  git("branch", "-f", "main", "example");

  browser = await chromium.launch();
  const inboxHtml = await (await fetch(origin)).text();
  assert.match(inboxHtml, /Change demo/);
  assert.doesNotMatch(inboxHtml, /<script[^>]+src=/);
  const reviewHtml = await (await fetch(url)).text();
  assert.ok(reviewHtml.includes("<h1>Change demo</h1>"));
  assert.doesNotMatch(reviewHtml, /Loading…/);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  const entry = page
    .getByTestId("review-link")
    .and(page.locator(`a[href="/reviews/${id}"]`));
  await expect(entry).toContainText("Change demo");
  await expect(entry).toContainText("1 file changed");
  await expect(entry).toContainText("Base");
  await expect(entry).toContainText("Head");
  await expect(entry).not.toContainText("demo.ts");
  await expect(page.locator(`a[href="/reviews/${namedId}"]`)).toContainText(
    "Named comparison",
  );
  await expect(page.locator(`a[href="/reviews/${legacyId}"]`)).toContainText(
    "Untitled review",
  );
  await expect(entry.locator("code")).toHaveText([
    initial.base.slice(0, 7),
    initial.head.slice(0, 7),
  ]);
  await expect(entry).not.toContainText(initial.head);
  await page.locator(`a[href="/reviews/${id}"]`).click();
  await expect(
    page
      .getByRole("navigation", { name: "Changed files" })
      .getByText("demo.ts"),
  ).toBeVisible();
  await expect(
    page.locator("diffs-container").getByText(/green/),
  ).toBeVisible();
  await expect(page.getByTestId("diff-file")).toHaveJSProperty("open", true);
  await expect(page.locator(".masthead")).toHaveCSS("position", "sticky");
  await expect(page.getByTestId("file-heading")).toHaveCSS(
    "position",
    "sticky",
  );
  await expect(
    page.locator(".masthead").getByRole("link", { name: "← Inbox" }),
  ).toHaveAttribute("href", "/");
  await expect(
    page.locator(".masthead").getByRole("group", { name: "Diff layout" }),
  ).toBeVisible();
  await page.getByTestId("view-unified").click();
  await expect(page.getByTestId("view-unified")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('diffs-container [data-column-number="1"]').last().click();
  await page
    .getByTestId("new-comment-form")
    .locator("textarea")
    .fill("Keep <b>green</b> for the synthetic demo.");
  await page.getByTestId("new-comment").click();
  await expect(
    page.getByText("Keep <b>green</b> for the synthetic demo."),
  ).toBeVisible();
  const [thread] = await cli("comments", id);
  assert.equal(
    thread.messages[0].text,
    "Keep <b>green</b> for the synthetic demo.",
  );
  await cli("reply", id, thread.id, "--text", "Agreed.");
  await page.reload();
  await expect(page.getByText("Agreed.", { exact: true })).toBeVisible();
  await page.getByTestId("resolve").click();
  await expect(page.getByTestId("reopen")).toBeVisible();
  assert.equal((await cli("comments", id))[0].resolved, true);

  assert.deepEqual(await cli("rename", id, "--title", "  Renamed from CLI  "), {
    title: "Renamed from CLI",
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Renamed from CLI", exact: true }),
  ).toBeVisible();
  await page.getByTestId("rename-review").click();
  await page.getByLabel("Review title").fill("<b>Browser title</b>");
  await page.getByTestId("save-review-title").click();
  await expect(
    page.getByRole("heading", { name: "<b>Browser title</b>", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Agreed.", { exact: true })).toBeVisible();

  await page.getByTestId("file-viewed").click();
  await expect(page.getByTestId("file-viewed")).toBeChecked();
  await expect(page.getByTestId("diff-file")).toHaveJSProperty("open", false);
  await stop();
  await start();

  const persisted = await (await fetch(api)).json();
  assert.deepEqual(persisted.viewedFiles, [0]);
  assert.equal(persisted.title, "<b>Browser title</b>");
  for (const key of [
    "id",
    "base",
    "head",
    "mergeBase",
    "patch",
    "created",
    "fileCount",
  ]) {
    assert.equal(persisted[key], initial[key]);
  }
  assert.equal(persisted.threads[0].resolved, true);
  assert.equal(persisted.threads[0].messages.length, 2);
  await page.goto(origin);
  await expect(entry).toContainText("<b>Browser title</b>");
  await page.goto(url);
  await expect(page.getByTestId("file-viewed")).toBeChecked();
  await page.getByTestId("file-viewed").click();
  await expect(page.getByTestId("diff-file")).toHaveJSProperty("open", true);
  assert.deepEqual((await (await fetch(api)).json()).viewedFiles, []);
  await page.getByTestId("reopen").click();
  await expect(page.getByTestId("resolve")).toBeVisible();
  assert.equal((await cli("resolve", id, thread.id)).resolved, true);
  assert.equal((await cli("reopen", id, thread.id)).resolved, false);
  await cli(
    "note",
    id,
    "--file",
    "0",
    "--side",
    "old",
    "--line",
    "1",
    "--text",
    "Old side",
  );
  assert.equal((await cli("comments", id))[1].side, "old");
  const scopedNote = (body) =>
    fetch(`${api}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Harrhy-Review": "1" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await scopedNote({ scope: "file", file: 1, text: "Bad file" })).status,
    400,
  );
  await expect(page.getByTestId("review-comments")).toBeHidden();
  await page.getByTestId("review-comment-open").click();
  await page
    .getByRole("textbox", { name: "Comment on this review" })
    .fill("Review note");
  await page.getByTestId("review-comment").click();
  await expect(page.getByText("Review note", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("review-comments")).toBeHidden();
  await page.getByTestId("file-comment-open").click();
  await page
    .getByRole("textbox", { name: "Comment on this file" })
    .fill("File note");
  await page.getByTestId("file-comment").click();
  await expect(page.getByText("File note", { exact: true })).toBeVisible();
  const scopes = (await cli("comments", id)).slice(2).map(({ scope }) => scope);
  assert.deepEqual(scopes, ["review", "file"]);
  await page.reload();
  await page.getByTestId("review-comment-open").click();
  await expect(page.getByText("Review note", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("file-comment-open").click();
  await expect(page.getByText("File note", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  assert.equal((await setViewed(0, true)).status, 200);
  await writeFile(source, 'export const color = "orange";\n');
  git("add", ".");
  git("commit", "-m", "Change demo again");
  const changed = await cli(
    "submit",
    "--repo",
    repo,
    "--base",
    "main",
    "--head",
    "example",
    "--json",
  );
  const changedReview = await (
    await fetch(`${origin}/api/reviews/${changed.id}`)
  ).json();
  assert.notEqual(changedReview.patch, initial.patch);
  assert.deepEqual(changedReview.viewedFiles, []);
  assert.deepEqual((await (await fetch(api)).json()).viewedFiles, [0]);
  const gitHead = git("rev-parse", "HEAD");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("delete-review").click();
  await expect(page).toHaveURL(`${origin}/`);
  assert.equal((await fetch(url)).status, 404);
  assert.equal((await fetch(api)).status, 404);
  assert.equal(git("rev-parse", "HEAD"), gitHead);
  assert.equal(git("status", "--porcelain"), "");
  assert.deepEqual(errors, []);
  await stop();
  const browserOrigin = "https://review.example.test";
  await writeFile(
    join(project, ".dev.vars"),
    `HARRHY_REVIEW_ORIGIN=${origin}
HARRHY_REVIEW_BROWSER_ORIGIN=${browserOrigin}
`,
  );
  await start();
  const hosted = `${origin}/api/reviews/${changed.id}/viewed`;
  for (const [supplied, expected] of [
    [undefined, 403],
    [origin, 403],
    [browserOrigin, 200],
  ]) {
    const gatewayHeaders = {
      "Content-Type": "application/json",
      "X-Harrhy-Review": "1",
    };
    if (supplied) gatewayHeaders.Origin = supplied;
    assert.equal(
      (
        await fetch(hosted, {
          method: "PUT",
          headers,
          body: JSON.stringify({ file: 0, viewed: true }),
        })
      ).status,
      expected,
    );
  }
  console.log(
    "Celld restart, immutable snapshot, Chromium and CLI review workflow passed",
  );
} finally {
  await browser?.close();
  await stop();
  await rm(root, { recursive: true, force: true });
}
