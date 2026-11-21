import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { WebSocket } from "ws";
import {
  holdIn,
  http,
  startFixture,
  TEST,
  until,
} from "../../pi/__tests__/p2/helpers.ts";
import { Sharing } from "../../pi/plugins/sharing/contract.ts";
import { Catalog, Sessions } from "../../pi/plugins/sessions/contract.ts";
import { followCatalog } from "../read-only/chord.ts";

// Run inside its own network namespace. No live endpoint, credential or data-dir input.
const fixture = await startFixture();
const dir = await mkdtemp(join(tmpdir(), "clank-read-only-"));
const port = fixture.server.port,
  viewPort = 19883,
  origin = `http://127.0.0.1:${viewPort}`;
let child, browser;
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
  const sharing = await holdIn(owner, Sharing, { session: seeded.id }, "owner");
  await sharing.link({ mode: "view" }, TEST);
  const links = await until(sharing.links, (entries) =>
    entries?.some((l) => l.mode === "view"),
  );
  const joined = await http(port, "/join", {
    method: "POST",
    headers: {
      Origin: `http://127.0.0.1:${port}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: links.find((l) => l.mode === "view").token,
      name: "Fixture guest",
    }),
  });
  assert.equal(joined.status, 200);
  const guest = String(joined.headers["set-cookie"]).split(";")[0];
  await holdIn(fixture.client({ Cookie: guest }).host, Sessions, {}, "guest");
  await assert.rejects(
    followCatalog(
      port,
      guest,
      () => assert.fail("Guest received a catalog"),
      () => {},
    ),
    /Pi owner Sessions required/,
  );
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
        "read-only/server.ts",
        String(port),
        String(viewPort),
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
  const headers = {
    Authorization: `Basic ${Buffer.from(`clank:${password}`).toString("base64")}`,
  };
  assert.equal((await fetch(origin + "/catalog")).status, 401);
  assert.equal(
    (
      await fetch(origin + "/catalog", {
        headers: { ...headers, Origin: "http://other.invalid" },
      })
    ).status,
    403,
  );
  const rpc = new WebSocket(origin.replace("http:", "ws:") + "/live", {
    headers,
    handshakeTimeout: 3000,
  });
  const [attempt, refusal] = await once(rpc, "unexpected-response");
  assert.equal(refusal.statusCode, 404);
  refusal.resume();
  attempt.destroy();
  assert.equal(
    (
      await fetch(origin + "/catalog", {
        headers,
        method: "POST",
        body: JSON.stringify({ kind: "archive", id: seeded.id }),
      })
    ).status,
    405,
  );
  const stream = await fetch(origin + "/catalog", { headers });
  const reader = stream.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  await reader.cancel();
  assert.deepEqual(JSON.parse(first.slice(6)), [
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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN });
  const ctx = await browser.newContext({
    httpCredentials: { username: "clank", password, origin },
  });
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
  const catalog = await holdIn(owner, Sessions, {}, "owner");
  await catalog.rename({ id: seeded.id, title: "Watched update" }, TEST);
  await page
    .getByRole("button", { name: "Session Watched update", exact: true })
    .waitFor();
  child.kill();
  await running.exit;
  await page.getByText("Catalog disconnected").waitFor();
  assert.equal(await page.locator("svg path").count(), 0);
  await catalog.rename({ id: seeded.id, title: "Fresh on reconnect" }, TEST);
  running = await start();
  await page
    .getByRole("button", { name: "Session Fresh on reconnect", exact: true })
    .waitFor();
  await fixture.server.host.revoke({ owners: "local" }, TEST);
  await page.getByText("Catalog disconnected").waitFor();
  assert.equal(await page.locator("svg path").count(), 0);
  assert.equal((await running.exit)[0], 1);
  assert.deepEqual(errors, []);
  console.log(
    "Read-only: real guest denied; preview write denied; bounded owner projection; live update and fresh reconnect; revocation cleared map and closed listener.",
  );
} finally {
  child?.kill();
  await browser?.close();
  await fixture.close();
  await rm(dir, { recursive: true, force: true });
}
