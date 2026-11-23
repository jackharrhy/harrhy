import { build } from "esbuild";
import { verifyCelldBinary } from "../../../scripts/celld-runtime.mjs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { WebSocket } from "ws";
import { holdIn, startFixture, TEST } from "../../pi/__tests__/p2/helpers.ts";
import { Catalog, Sessions } from "../../pi/plugins/sessions/contract.ts";

// Run inside its own network namespace. No live endpoint, credential or data-dir input.
const fixture = await startFixture();
const dir = await mkdtemp(join(tmpdir(), "clank-read-only-"));
const port = fixture.server.port,
  viewPort = 19883,
  origin = `http://127.0.0.1:${viewPort}`;
let child, browser, pilot, worker;
try {
  const seeded = await fixture.server.host.root(async (ctx) => {
    const c = await ctx.get(Catalog, {});
    const row = await c.create(
      {
        title: "Disposable map",
        cwd: fixture.workspace,
        model: { provider: "faux", modelId: "faux-1" },
        thinkingLevel: "off",
      },
      ctx,
    );
    await c.update(
      {
        id: row.id,
        main: 2,
        branches: [
          { conversation: 1, label: null },
          { conversation: 2, parent: 1, label: "Fork" },
        ],
      },
      ctx,
    );
    return row;
  }, TEST);
  const owner = fixture.browser();
  const token = randomBytes(32).toString("hex");
  await writeFile(join(dir, "bridge-token"), token, { mode: 0o600 });
  const password = randomBytes(32).toString("hex");
  await writeFile(join(dir, "view-password"), password, { mode: 0o600 });
  await writeFile(join(dir, "pi-cookie"), fixture.owner.cookie, {
    mode: 0o600,
  });
  async function start() {
    child = spawn(
      process.execPath,
      [
        "--import",
        "../pi/src/source-resolver.ts",
        "read-only/source.ts",
        String(port),
        String(viewPort + 1),
        dir,
      ],
      {
        cwd: new URL("../", import.meta.url),
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    const exit = once(child, "exit");
    await Promise.race([
      once(child.stdout, "data"),
      exit.then(() => {
        throw Error("Connector failed to bind");
      }),
    ]);
    return { exit };
  }
  let running = await start();
  const { CELLD_BIN: binary } = process.env;
  await verifyCelldBinary(binary);
  async function launchWorker(stage, listen, publicOrigin) {
    for (const file of ["worker.mjs", "wrangler.jsonc"])
      await copyFile(
        new URL("../.celld/standalone/" + file, import.meta.url),
        join(stage, file),
      );
    await writeFile(
      join(stage, ".dev.vars"),
      `HARRHY_CLANK_MODE=read-only
HARRHY_CLANK_PUBLIC_ORIGIN=${publicOrigin}
HARRHY_CLANK_SOURCE_PORT=${viewPort + 1}
HARRHY_CLANK_VIEW_PASSWORD=${password}
HARRHY_CLANK_BRIDGE_TOKEN=${token}
`,
      { mode: 0o600 },
    );
    return spawn(
      binary,
      [
        "dev",
        stage,
        "--host",
        "127.0.0.1",
        "--port",
        String(listen),
        "--no-watch",
      ],
      {
        cwd: stage,
        stdio: "ignore",
        env: {
          ...process.env,
          CELLD_ESBUILD: fileURLToPath(
            new URL("../node_modules/.bin/esbuild", import.meta.url),
          ),
        },
      },
    );
  }
  worker = await launchWorker(
    await mkdtemp(join(dir, "app-")),
    viewPort,
    origin,
  );
  for (let i = 0; i < 100; i++) {
    if ((await fetch(origin).catch(() => null))?.status === 401) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const headers = {
    Authorization: `Basic ${Buffer.from(`clank:${password}`).toString("base64")}`,
  };
  for (const path of ["/", "/sessions.js", "/live"])
    assert.equal((await fetch(origin + path)).status, 401);
  assert.equal((await fetch(origin + "/catalog", { headers })).status, 404);
  const wrongOrigin = new WebSocket(origin.replace("http", "ws") + "/live", {
    headers: { ...headers, Origin: "https://other.invalid" },
  });
  const [attempt, denial] = await once(wrongOrigin, "unexpected-response");
  assert.equal(denial.statusCode, 403);
  denial.resume();
  attempt.destroy();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN });
  const ctx = await browser.newContext({
    httpCredentials: { username: "clank", password, origin },
  });
  const publicOrigin = "https://allocation.invalid";
  pilot = await launchWorker(
    await mkdtemp(join(dir, "pilot-")),
    viewPort + 2,
    publicOrigin,
  );
  const transport = `http://127.0.0.1:${viewPort + 2}`;
  for (let i = 0; i < 100; i++) {
    if (await fetch(transport).catch(() => null)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const admission = new WebSocket(transport.replace("http", "ws") + "/live", {
    headers: { ...headers, Host: "allocation.invalid", Origin: publicOrigin },
  });
  await once(admission, "open");
  admission.close();
  const spoof = await fetch(transport, {
    headers: { ...headers, "X-Forwarded-Host": "allocation.invalid" },
  });
  assert.equal(spoof.status, 404);
  const probe = await build({
    entryPoints: [
      fileURLToPath(new URL("./browser-probe.mjs", import.meta.url)),
    ],
    bundle: true,
    format: "iife",
    write: false,
  });
  await ctx.addInitScript({ content: probe.outputFiles[0].text });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Session Disposable map", exact: true })
    .waitFor();
  assert.equal(await page.locator("svg path").count(), 2);
  assert.equal(
    await page.getByRole("button", { name: /create|rename|archive/i }).count(),
    0,
  );
  const first = await page.evaluate(async () => {
    const { api, frames, ws, closed } = await window.probeCatalog();
    const f = frames[0];
    const id = f.rows[0].id;
    const denied = [];
    for (const send of [
      () => api.create(f.epoch, "Do not create"),
      () => api.rename(f.epoch, id, "Do not rename"),
      () => api.archive(f.epoch, id),
    ]) {
      try {
        await send();
        denied.push(false);
      } catch {
        denied.push(true);
      }
    }
    ws.close();
    await closed;
    return { rows: f.rows, denied };
  });
  assert.deepEqual(first.denied, [true, true, true]);
  assert.deepEqual(first.rows, [
    {
      id: seeded.id,
      title: "Disposable map",
      createdAt: seeded.createdAt,
      main: 2,
      branches: [
        { conversation: 1, label: null },
        { conversation: 2, label: "Fork", parent: 1 },
      ],
    },
  ]);
  await page.getByRole("button", { name: "Show session list" }).click();
  assert.equal(await page.locator("form").count(), 0);
  await page.getByRole("button", { name: "Show overview" }).click();
  const catalog = await holdIn(owner, Sessions, {}, "owner");
  await catalog.rename({ id: seeded.id, title: "Watched update" }, TEST);
  await page
    .getByRole("button", { name: "Session Watched update", exact: true })
    .waitFor();
  child.kill();
  await running.exit;
  await page.getByText("Waiting for live sessions…").waitFor();
  assert.equal(await page.locator("svg path").count(), 0);
  await catalog.rename({ id: seeded.id, title: "Fresh on reconnect" }, TEST);
  running = await start();
  await page
    .getByRole("button", { name: "Session Fresh on reconnect", exact: true })
    .waitFor();
  await fixture.server.host.revoke({ owners: "local" }, TEST);
  await page.getByText("Waiting for live sessions…").waitFor();
  assert.equal(await page.locator("svg path").count(), 0);
  assert.equal((await running.exit)[0], 1);
  assert.deepEqual(errors, []);
  console.log(
    "Read-only: preview write denied; bounded owner projection; live update and fresh reconnect; revocation cleared map and closed listener.",
  );
} finally {
  pilot?.kill();
  worker?.kill();
  child?.kill();
  await browser?.close();
  await fixture.close();
  await rm(dir, { recursive: true, force: true });
}
