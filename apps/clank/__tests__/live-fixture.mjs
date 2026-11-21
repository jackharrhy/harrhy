// Opt-in: mutates only the existing loopback fixture. Leaves one archived receipt row.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { WebSocket } from "ws";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const origin = "http://127.0.0.1:18148";
const password = (
  await readFile(
    `${process.env.HOME}/.local/state/clank-v0/view-password`,
    "utf8",
  )
).trim();
const authorization = `Basic ${Buffer.from(`clank:${password}`).toString("base64")}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const connections = () =>
  execFileSync("ss", ["-Hnt", "state", "established", "( sport = :18149 )"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean).length;
const baseline = connections();
async function denied(url, headers, status) {
  await new Promise((resolve, reject) => {
    const s = new WebSocket(url, { headers, handshakeTimeout: 3000 });
    s.once("error", reject);
    s.once("open", () => {
      s.close();
      reject(Error("Unexpected upgrade"));
    });
    s.once("unexpected-response", (req, res) => {
      res.resume();
      req.destroy();
      try {
        assert.equal(res.statusCode, status);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}
await denied(origin.replace("http", "ws") + "/live", { Origin: origin }, 401);
await denied(
  origin.replace("http", "ws") + "/live",
  { Origin: "http://other.example", Authorization: authorization },
  403,
);
await denied("ws://127.0.0.1:18149/rpc", {}, 403);
assert.equal(
  (
    await fetch(origin + "/sessions?after=x", {
      headers: { Authorization: authorization },
    })
  ).status,
  404,
);

const heading = (page, name) =>
  page.getByRole("heading", { name, exact: true });
const browser = await chromium.launch();
const receipt = { latenciesMs: {}, inboundBytes: {} };
try {
  const context = await browser.newContext({
    httpCredentials: { username: "clank", password, origin },
  });
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        window.testSocket = this;
      }
    };
  });
  // An independent browser consumer of /live. Only the test context loads this helper.
  const probeBundle = await build({
    entryPoints: [
      fileURLToPath(new URL("./browser-probe.mjs", import.meta.url)),
    ],
    bundle: true,
    format: "iife",
    write: false,
  });
  await context.addInitScript({ content: probeBundle.outputFiles[0].text });
  const [editor, reader] = await Promise.all([
    context.newPage(),
    context.newPage(),
  ]);
  const errors = [];
  for (const p of [editor, reader]) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(8000);
  }
  let requests = 0,
    sent = 0,
    received = 0,
    bytes = 0,
    sockets = 0;
  reader.on("request", () => requests++);
  reader.on("websocket", (ws) => {
    sockets++;
    assert.equal(ws.url(), origin.replace("http", "ws") + "/live");
    ws.on("framesent", () => sent++);
    ws.on("framereceived", ({ payload }) => {
      received++;
      bytes += Buffer.byteLength(payload);
    });
  });
  const title = `Realtime check ${Date.now()}`,
    renamed = `${title} renamed`;
  const row = (name) =>
    editor.locator("li").filter({ has: heading(editor, name) });
  async function measure(name, work) {
    const t = performance.now(),
      before = bytes;
    await work();
    receipt.inboundBytes[name] = bytes - before;
    receipt.latenciesMs[name] = Math.round(performance.now() - t);
  }
  await measure("twoPageBind", async () =>
    Promise.all(
      [editor, reader].map(async (p) => {
        await p.goto(origin);
        await p.getByText("Live", { exact: true }).waitFor();
      }),
    ),
  );
  assert.equal((await context.cookies()).length, 0);
  await pause(250);
  const idle = [requests, sent, received];
  await pause(10_000);
  assert.deepEqual([requests, sent, received], idle);
  receipt.idleMs = 10000;
  // Hold the initial snapshot at the browser while all three mutations commit.
  const held = await context.newPage();
  await held.goto(origin + "/sessions.js");
  await held.evaluate(async () => {
    window.held = await window.probeCatalog(true);
  });
  await editor.getByLabel("Session title", { exact: true }).fill(title);
  await measure("create", async () => {
    await editor.getByRole("button", { name: "Create", exact: true }).click();
    await heading(reader, title).waitFor();
  });
  await row(title).getByLabel("New title").fill(renamed);
  await measure("rename", async () => {
    await row(title).getByRole("button", { name: "Rename" }).click();
    await heading(reader, renamed).waitFor();
  });
  await measure("archive", async () => {
    await row(renamed).getByRole("button", { name: "Archive" }).click();
    await heading(reader, renamed).waitFor({ state: "detached" });
  });
  await reader.getByRole("button", { name: "Show archive" }).click();
  await heading(reader, renamed).waitFor();
  assert.equal(await held.evaluate(() => window.held.frames.length), 1);
  await held.evaluate(() => window.held.resume());
  await held.waitForFunction(() => window.held.frames.length === 2);
  const [snapshot, folded] = await held.evaluate(() => window.held.frames);
  assert.equal(snapshot.kind, "snapshot");
  assert.equal(snapshot.seq, 0);
  assert.equal(folded.epoch, snapshot.epoch);
  assert.equal(folded.seq, 1);
  assert.equal(folded.put.length, 1);
  assert.equal(folded.put[0].title, renamed);
  assert.ok(folded.put[0].archivedAt);
  receipt.snapshotRows = snapshot.rows.length;
  receipt.heldReaderUpdates = 1;
  const old = snapshot.epoch;
  await held.evaluate(async () => {
    window.held.ws.close();
    await window.held.closed;
    window.held = await window.probeCatalog();
  });
  const fresh = await held.evaluate(() => window.held.frames[0]);
  assert.equal(fresh.seq, 0);
  assert.notEqual(fresh.epoch, old);
  assert.ok(fresh.rows.find((r) => r.title === renamed)?.archivedAt);
  // The public target exposes explicit commands, not the upstream execute capability.
  assert.equal(
    await held.evaluate(async () => {
      try {
        await window.held.api.execute({
          kind: "archive",
          id: crypto.randomUUID(),
        });
      } catch {
        return "refused";
      }
    }),
    "refused",
  );
  assert.equal(
    await held.evaluate(async (epoch) => {
      try {
        await window.held.api.rename(epoch, crypto.randomUUID(), "missing");
      } catch {
        return "refused";
      }
    }, fresh.epoch),
    "refused",
  );
  await held.evaluate(async (epoch) => {
    try {
      await window.held.api.create(epoch, "stale");
      throw Error("Unexpected stale write");
    } catch (e) {
      if (e.message === "Unexpected stale write") throw e;
    }
    await window.held.closed;
  }, old);
  await measure("rebind", async () => {
    await reader.evaluate(() => window.testSocket.close());
    await reader.getByText("Disconnected. Reconnecting…").waitFor();
    await heading(reader, renamed).waitFor();
  });
  assert.equal(sockets, 2);
  // Do not finish the callback. The same 8s delivery deadline covers both RPC hops.
  receipt.slowReader = await held.evaluate(async () => {
    const start = performance.now(),
      p = await window.probeCatalog(true);
    let timer;
    try {
      await Promise.race([
        p.closed,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("Stalled callback not retired")),
            12000,
          );
        }),
      ]);
      return {
        frames: p.frames.length,
        ms: Math.round(performance.now() - start),
      };
    } finally {
      clearTimeout(timer);
      p.ws.close();
    }
  });
  assert.equal(receipt.slowReader.frames, 1);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
for (let i = 0; i < 30 && connections() !== baseline; i++) await pause(100);
assert.equal(connections(), baseline);
receipt.bridgeConnectionsAfter = baseline;
console.log(JSON.stringify(receipt, null, 2));
