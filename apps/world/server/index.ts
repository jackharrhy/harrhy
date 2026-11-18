import { resolve } from "node:path";
import { router } from "../app/router";
import { createRoom } from "../shared/room";
import { parseInput, TICK_MS, type ServerMessage } from "../shared/protocol";

const port = Number(process.env.HARRHY_WORLD_PORT ?? 3189);
const origin = new URL(process.env.HARRHY_WORLD_ORIGIN ?? `http://127.0.0.1:${port}`).origin;
const assets = resolve(import.meta.dir, "../client");
const room = await createRoom();
type Peer = { id: string; rateStart: number; messages: number };
let reserved = 0;
const peers = new Map<string, Bun.ServerWebSocket<Peer>>();
function send(ws: Bun.ServerWebSocket<Peer>, message: ServerMessage) {
  ws.send(JSON.stringify(message));
}

const server = Bun.serve<Peer>({
  port,
  hostname: "127.0.0.1",
  async fetch(request, host) {
    const incoming = new URL(request.url);
    const path = incoming.pathname;
    if (request.method === "GET" && path === "/room") {
      if (request.headers.get("origin") !== origin) return new Response(null, { status: 403 });
      if (peers.size + reserved >= 12) return new Response("Room is full", { status: 503 });
      if (host.upgrade(request, { data: { id: crypto.randomUUID(), rateStart: 0, messages: 0 } })) {
        reserved++;
        return;
      }
      return new Response(null, { status: 426 });
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, { status: 405 });
    if (path === "/healthz") return Response.json({ status: "ready" });
    if (path === "/world.css" || /^\/(?:assets|textures|billboard)\/[a-zA-Z0-9._-]+$/.test(path)) {
      const file = Bun.file(assets + path);
      if (await file.exists())
        return new Response(request.method === "HEAD" ? null : file, {
          headers: { "Content-Type": file.type, "X-Content-Type-Options": "nosniff" },
        });
    }
    if (path !== "/") return new Response(null, { status: 404 });
    const response = await router.fetch(new Request(new URL(path, origin), request));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
  websocket: {
    maxPayloadLength: 512,
    idleTimeout: 60,
    backpressureLimit: 32_768,
    closeOnBackpressureLimit: true,
    open(ws) {
      reserved--;
      const id = ws.data.id;
      room.join(id);
      peers.set(id, ws);
      send(ws, { type: "welcome", id });
      for (const [peerId, peer] of peers) {
        if (peerId !== id) send(peer, { type: "joined", id });
      }
      send(ws, { type: "roster", ids: [...peers.keys()] });
      send(ws, { type: "motion", ...room.snapshot() });
    },
    message(ws, payload) {
      const now = performance.now();
      if (now - ws.data.rateStart >= 1000) {
        ws.data.rateStart = now;
        ws.data.messages = 0;
      }
      if (++ws.data.messages > 120) return void ws.close(1008, "Input rate limit");
      const input = typeof payload === "string" ? parseInput(payload) : null;
      if (input) room.input(ws.data.id, input);
    },
    close(ws) {
      const id = ws.data.id;
      peers.delete(id);
      room.leave(id);
      for (const peer of peers.values()) send(peer, { type: "left", id });
    },
  },
});

let frame = 0;
const timer = setInterval(() => {
  if (!peers.size) return;
  room.step();
  if (++frame % 3 !== 0) return;
  const message = JSON.stringify({ type: "motion", ...room.snapshot() } satisfies ServerMessage);
  for (const ws of peers.values()) if (ws.getBufferedAmount() < 4096) ws.send(message);
}, TICK_MS);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    clearInterval(timer);
    server.stop(true);
    room.dispose();
  });
console.log(`World listening on ${server.url}`);
