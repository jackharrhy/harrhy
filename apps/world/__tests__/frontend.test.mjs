import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import WebSocket from "ws";

const base = process.env.HARRHY_WORLD_TEST_URL;
if (!base || !/^http:\/\/(127\.0\.0\.1|\[::1\]):\d+$/.test(base))
  throw Error(
    "Set HARRHY_WORLD_TEST_URL to a disposable loopback World origin",
  );
const ws = base.replace(/^http/, "ws");

test("Celld serves the nonce-protected Remix shell and native asset bytes", async () => {
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("cache-control"), /no-store/);
  const policy = home.headers.get("content-security-policy");
  const [, nonce] = policy.match(/script-src [^;]*'nonce-([^']+)'/);
  assert.ok(policy.includes(`connect-src data: 'self' ${ws};`));
  const html = await home.text();
  assert.match(html, /Pool Hall/);
  assert.ok(html.includes(`nonce="${nonce}" src="/assets/boot.js"`));
  for (const [path, type] of [
    ["world.css", "text/css"],
    ["assets/boot.js", "text/javascript"],
    ["billboard/player-billboard.png", "image/png"],
    ["textures/hall-brick.webp", "image/webp"],
    ["audio/impact.wav", "audio/wav"],
    ["maps/hall.bsp", "application/octet-stream"],
  ]) {
    const built =
      path === "maps/hall.bsp" ? "content/hall.bsp" : `dist/client/${path}`;
    const expected = await readFile(new URL(`../${built}`, import.meta.url));
    const result = await fetch(`${base}/${path}`);
    assert.equal(result.status, 200, path);
    assert.equal(result.headers.get("content-type").split(";")[0], type);
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), expected);
    const head = await fetch(`${base}/${path}`, { method: "HEAD" });
    assert.equal(head.headers.get("content-length"), String(expected.length));
    assert.equal(await head.text(), "");
  }
  for (const path of [
    "/__bench/timing",
    "/assets/absent.js",
    "/celld/worker.ts",
  ])
    assert.equal((await fetch(base + path)).status, 404, path);
  assert.equal(
    (await fetch(`${base}/world.css`, { method: "POST" })).status,
    405,
  );
  assert.equal((await fetch(`${base}/room`)).status, 426);
});

test(
  "room checks origin, subprotocol and BSP revision before admission",
  { timeout: 10000 },
  async (t) => {
    const { revision } = await (await fetch(`${base}/healthz`)).json();
    assert.match(revision, /^bsp30-/);
    async function refused(rev, origin, protocol, status) {
      const client = new WebSocket(`${ws}/room?revision=${rev}`, protocol, {
        origin,
      });
      const [error] = await once(client, "error", { signal: t.signal });
      assert.match(error.message, new RegExp(String(status)));
    }
    await refused(revision, undefined, [], 403);
    await refused(revision, `${base}/`, [], 403);
    await refused(revision, base, ["unsupported"], 400);
    await refused("stale", base, [], 409);
    const client = new WebSocket(`${ws}/room?revision=${revision}`, {
      origin: base,
    });
    t.after(() => client.terminate());
    client.on("open", () =>
      client.send(
        JSON.stringify({ type: "hello", resumeToken: crypto.randomUUID() }),
      ),
    );
    const [welcome] = await once(client, "message", { signal: t.signal });
    assert.equal(JSON.parse(welcome).type, "welcome");
    const closed = once(client, "close", { signal: t.signal });
    client.send(Buffer.alloc(513));
    assert.equal((await closed)[0], 4009);
  },
);
