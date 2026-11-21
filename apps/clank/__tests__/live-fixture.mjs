// Opt-in: mutates only the existing loopback fixture. Leaves one archived receipt row.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { WebSocket } from "ws";

const origin = "http://127.0.0.1:18148";
const password = (
  await readFile(`${process.env.HOME}/.local/state/clank-v0/view-password`, "utf8")
).trim();
const authorization = `Basic ${Buffer.from(`clank:${password}`).toString("base64")}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const connections = () =>
  execFileSync("ss", ["-Hnt", "state", "established", "( sport = :18149 )"], { encoding: "utf8" })
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
  (await fetch(origin + "/sessions?after=x", { headers: { Authorization: authorization } })).status,
  404,
);

const browser = await chromium.launch();
const receipt = { latenciesMs: {}, wire: [] };
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
  const [editor, reader] = await Promise.all([context.newPage(), context.newPage()]);
  const errors = [];
  for (const p of [editor, reader]) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(8000);
  }
  let requests = 0,
    sent = 0;
  reader.on("request", () => requests++);
  reader.on("websocket", (ws) => {
    assert.equal(ws.url(), origin.replace("http", "ws") + "/live");
    ws.on("framesent", () => sent++);
    ws.on("framereceived", ({ payload }) => {
      const f = JSON.parse(payload);
      receipt.wire.push({
        kind: f.kind,
        seq: f.seq,
        epoch: f.epoch,
        bytes: Buffer.byteLength(payload),
        rows: (f.rows ?? f.put)?.length,
      });
    });
  });
  const title = `Realtime check ${Date.now()}`,
    renamed = `${title} renamed`;
  const heading = (page, name) => page.getByRole("heading", { name, exact: true });
  const row = (name) => editor.locator("li").filter({ has: heading(editor, name) });
  async function measure(name, work) {
    const t = performance.now();
    await work();
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
  const idle = [requests, sent, receipt.wire.length];
  await pause(10_000);
  assert.deepEqual([requests, sent, receipt.wire.length], idle);
  receipt.idleMs = 10000;
  // Hold the initial snapshot at the browser while all three mutations commit.
  const held = await context.newPage();
  await held.goto(origin + "/sessions.js");
  await held.evaluate(
    () =>
      new Promise((resolve) => {
        const ws = new WebSocket("/live");
        window.held = ws;
        window.frames = [];
        ws.onmessage = (e) => {
          window.frames.push(JSON.parse(e.data));
          resolve();
        };
      }),
  );
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
  assert.deepEqual(
    receipt.wire.map((f) => f.kind),
    ["snapshot", "change", "change", "change"],
  );
  assert.deepEqual(
    receipt.wire.map((f) => f.seq),
    [0, 1, 2, 3],
  );
  assert.ok(receipt.wire.slice(1).every((f) => f.rows === 1 && f.epoch === receipt.wire[0].epoch));
  assert.equal(await held.evaluate(() => window.frames.length), 1);
  await held.evaluate(() => {
    const { epoch, seq } = window.frames[0];
    window.held.send(JSON.stringify({ kind: "ack", epoch, seq }));
  });
  await held.waitForFunction(() => window.frames.length === 2);
  const folded = await held.evaluate(() => window.frames[1]);
  assert.equal(folded.seq, 1);
  assert.equal(folded.put.length, 1);
  assert.equal(folded.put[0].title, renamed);
  assert.ok(folded.put[0].archivedAt);
  await held.close();
  receipt.heldReaderUpdates = 1;
  const old = receipt.wire[0].epoch;
  await measure("rebind", async () => {
    await reader.evaluate(() => window.testSocket.close());
    await reader.getByText("Disconnected. Reconnecting…").waitFor();
    await heading(reader, renamed).waitFor();
  });
  assert.equal(receipt.wire.at(-1).seq, 0);
  assert.notEqual(receipt.wire.at(-1).epoch, old);
  // A real but unknown session: safe command failure, not a fake optimistic rename.
  await reader.evaluate(
    (epoch) =>
      window.testSocket.send(
        JSON.stringify({ kind: "rename", id: crypto.randomUUID(), title: "missing", epoch }),
      ),
    receipt.wire.at(-1).epoch,
  );
  await reader.getByRole("alert").getByText("Command refused by Pi.").waitFor();
  // A stale writer cannot mutate across bindings. No mutation is replayed on reconnect.
  await reader.evaluate(
    (epoch) => window.testSocket.send(JSON.stringify({ kind: "create", title: "stale", epoch })),
    old,
  );
  await reader.getByText("Disconnected. Reconnecting…").waitFor();
  await heading(reader, renamed).waitFor();
  assert.deepEqual(errors, []);
  // One extra authenticated browser peer never acknowledges its snapshot.
  receipt.slowReader = await reader.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket("/live"),
          deadline = setTimeout(() => {
            ws.close();
            reject(Error("Slow reader not retired"));
          }, 12_000);
        let frames = 0,
          start = performance.now();
        ws.onmessage = () => frames++;
        ws.onclose = () => {
          clearTimeout(deadline);
          resolve({ frames, ms: Math.round(performance.now() - start) });
        };
      }),
  );
  assert.equal(receipt.slowReader.frames, 1);
} finally {
  await browser.close();
}
for (let i = 0; i < 30 && connections() !== baseline; i++) await pause(100);
assert.equal(connections(), baseline);
receipt.bridgeConnectionsAfter = baseline;
console.log(JSON.stringify(receipt, null, 2));
