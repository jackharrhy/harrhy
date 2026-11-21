import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import WebSocket, { WebSocketServer } from "ws";

async function bind(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

test(
  "World frontend proxies only the public Celld surface",
  { timeout: 10_000 },
  async (t) => {
    const portProbe = createServer();
    const port = await bind(portProbe);
    await new Promise((resolve) => portProbe.close(resolve));
    const origin = "https://world.example.test";
    const upstreamRoutes = [];
    const bytes = Buffer.from([0, 255, 18, 1]);
    const cell = createServer((request, response) => {
      upstreamRoutes.push(request.url);
      if (request.url === "/healthz") {
        response.setHeader("Content-Type", "application/json");
        response.end('{"status":"ready","map":"bsp","revision":"current"}');
      } else {
        assert.equal(request.url, "/maps/hall.bsp");
        response.setHeader("Content-Length", bytes.length);
        response.end(request.method === "HEAD" ? undefined : bytes);
      }
    });
    const rooms = new WebSocketServer({ noServer: true });
    t.after(() => {
      for (const peer of rooms.clients) peer.terminate();
      rooms.close();
      cell.close();
    });
    cell.on("upgrade", (request, socket, head) => {
      upstreamRoutes.push(request.url);
      assert.equal(request.headers.origin, origin);
      if (request.url !== "/room?revision=current") {
        socket.end("HTTP/1.1 409 Conflict\r\nContent-Length: 0\r\n\r\n");
        return;
      }
      rooms.handleUpgrade(request, socket, head, (peer) => {
        peer.send("welcome");
        peer.on("message", (data, binary) => peer.send(data, { binary }));
      });
    });
    const upstreamPort = await bind(cell);
    const frontend = spawn(process.execPath, ["dist/server/index.js"], {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        HARRHY_WORLD_PORT: String(port),
        HARRHY_WORLD_ORIGIN: origin,
        HARRHY_WORLD_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
      },
      stdio: ["ignore", "pipe", "inherit"],
      signal: t.signal,
    });
    t.after(() => frontend.kill());
    await Promise.race([
      once(frontend.stdout, "data", { signal: t.signal }),
      once(frontend, "exit", { signal: t.signal }).then(([code]) => {
        throw new Error(`Frontend exited before starting (${code})`);
      }),
    ]);
    const base = `http://127.0.0.1:${port}`;
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(
      home.headers.get("content-security-policy"),
      /wss:\/\/world\.example\.test/,
    );
    assert.match(await home.text(), /Pool Hall/);
    const css = await fetch(`${base}/world.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /text\/css/);
    await css.text();
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).revision, "current");
    const map = await fetch(`${base}/maps/hall.bsp`);
    assert.deepEqual(Buffer.from(await map.arrayBuffer()), bytes);
    const head = await fetch(`${base}/maps/hall.bsp`, { method: "HEAD" });
    assert.equal(head.headers.get("content-length"), String(bytes.length));
    assert.equal(await head.text(), "");
    assert.equal((await fetch(`${base}/__bench/timing`)).status, 404);
    assert.equal((await fetch(`${base}/room`)).status, 426);

    const wsUrl = `ws://127.0.0.1:${port}/room`;
    async function refused(revision, options) {
      const ws = new WebSocket(`${wsUrl}?revision=${revision}`, options);
      const [error] = await once(ws, "error", { signal: t.signal });
      return error.message;
    }
    assert.match(await refused("current", { origin: `${origin}/` }), /403/);
    assert.match(await refused("current", {}), /403/);
    assert.match(await refused("stale", { origin }), /409/);
    const client = new WebSocket(`${wsUrl}?revision=current`, { origin });
    t.after(() => client.terminate());
    const [welcome] = await once(client, "message", { signal: t.signal });
    assert.equal(String(welcome), "welcome");
    const echo = once(client, "message", { signal: t.signal });
    client.send(bytes);
    assert.deepEqual(await echo, [bytes, true]);
    const [peer] = rooms.clients;
    const closed = once(peer, "close", { signal: t.signal });
    client.close(4001, "leaving");
    const [code, reason] = await closed;
    assert.equal(code, 4001);
    assert.equal(String(reason), "leaving");

    const oversized = new WebSocket(`${wsUrl}?revision=current`, { origin });
    t.after(() => oversized.terminate());
    await once(oversized, "message", { signal: t.signal });
    const [nextPeer] = rooms.clients;
    const disconnected = once(nextPeer, "close", { signal: t.signal });
    nextPeer.on("message", () => assert.fail("Oversized input reached Celld"));
    oversized.send(Buffer.alloc(513));
    await disconnected;
    assert.deepEqual(upstreamRoutes, [
      "/healthz",
      "/maps/hall.bsp",
      "/maps/hall.bsp",
      "/room?revision=stale",
      "/room?revision=current",
      "/room?revision=current",
    ]);
  },
);
