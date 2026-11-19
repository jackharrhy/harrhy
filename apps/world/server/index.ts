import { createServer } from "node:http";
import { resolve } from "node:path";
import { createRequestListener } from "remix/node-fetch-server";
import { staticFiles } from "remix/middleware/static";
import { createRouter } from "remix/router";
import WebSocket, { WebSocketServer } from "ws";
import { router } from "../app/router";
import { BSP_MAP_PATH } from "../shared/protocol";

const port = Number(process.env.HARRHY_WORLD_PORT ?? 3189);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid HARRHY_WORLD_PORT");
const origin = process.env.HARRHY_WORLD_ORIGIN;
const publicUrl = URL.parse(origin ?? "");
if (
  !publicUrl ||
  !["http:", "https:"].includes(publicUrl.protocol) ||
  publicUrl.origin !== origin
)
  throw new Error("HARRHY_WORLD_ORIGIN must be an exact HTTP(S) origin");
const upstreamSetting = process.env.HARRHY_WORLD_UPSTREAM ?? "";
if (!/^http:\/\/(127\.0\.0\.1|\[::1\]):[0-9]+$/.test(upstreamSetting))
  throw new Error(
    "HARRHY_WORLD_UPSTREAM must be an HTTP loopback origin with an explicit port",
  );
const upstream = new URL(upstreamSetting);
const upstreamPort = Number(upstream.port || 80);
if (
  !upstreamPort ||
  (upstream.hostname === "127.0.0.1" && upstreamPort === port)
)
  throw new Error("HARRHY_WORLD_UPSTREAM must use a valid, separate listener");

const assets = createRouter({
  middleware: [staticFiles(resolve(import.meta.dirname, "../client"))],
});
const noStore = { "Cache-Control": "no-store" };

async function proxyHttp(request: Request, path: string) {
  try {
    const response = await fetch(new URL(path, upstream), {
      method: request.method,
      headers: { "Accept-Encoding": "identity" },
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    if (response.headers.has("Content-Encoding")) {
      await response.body?.cancel();
      return new Response(null, { status: 502, headers: noStore });
    }
    const headers = new Headers(noStore);
    for (const name of ["Content-Type", "Content-Length"]) {
      const value = response.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response(null, { status: 502, headers: noStore });
  }
}

const server = createServer(
  createRequestListener(
    async (request) => {
      const { pathname } = new URL(request.url);
      if (request.method !== "GET" && request.method !== "HEAD")
        return new Response(null, { status: 405 });
      if (pathname === "/healthz" || pathname === BSP_MAP_PATH)
        return proxyHttp(request, pathname);
      if (pathname === "/room")
        return new Response(null, {
          status: 426,
          headers: { Upgrade: "websocket" },
        });
      if (
        pathname === "/world.css" ||
        /^\/(?:assets|textures|billboard|audio)\/[a-zA-Z0-9._-]+$/.test(pathname)
      ) {
        const response = await assets.fetch(request);
        response.headers.set("X-Content-Type-Options", "nosniff");
        return response;
      }
      if (pathname !== "/") return new Response(null, { status: 404 });
      const response = await router.fetch(request);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    },
    {
      host: publicUrl.host,
      protocol: publicUrl.protocol as "https:" | "http:",
    },
  ),
);

const limits = {
  autoPong: false,
  perMessageDeflate: false,
  maxFragments: 128,
  maxBufferedChunks: 128,
  closeTimeout: 2_000,
};
const maxQueue = 32_768;
const active = new Set<WebSocket>();
const approved = new WeakMap<object, (browser: WebSocket) => void>();
const rooms = new WebSocketServer({
  ...limits,
  noServer: true,
  maxPayload: 512,
  verifyClient({ req }, accept) {
    if (active.size >= 24) return accept(false, 503);
    const target = new URL("/room", upstream);
    target.protocol = "ws:";
    target.search = new URL(req.url!, publicUrl).search;
    const cell = new WebSocket(target, {
      ...limits,
      maxPayload: maxQueue,
      handshakeTimeout: 3_000,
      origin,
    });
    active.add(cell);
    const hangup = () => cell.terminate();
    req.socket.once("close", hangup);
    cell.once("close", () => {
      active.delete(cell);
      req.socket.off("close", hangup);
    });
    let pending = true;
    function reject(status: number) {
      if (!pending) return;
      pending = false;
      if (!req.socket.destroyed) accept(false, status);
    }
    cell.on("error", () => reject(502));
    cell.once("unexpected-response", (_request, response) => {
      const status = response.statusCode;
      reject(status === 403 || status === 409 || status === 503 ? status : 502);
      cell.terminate();
    });
    cell.once("open", () => {
      pending = false;
      approved.set(req, (browser) => {
        approved.delete(req);
        req.socket.off("close", hangup);
        relay(browser, cell);
      });
      accept(true);
    });
  },
});

function relay(browser: WebSocket, cell: WebSocket) {
  function abort() {
    browser.terminate();
    cell.terminate();
  }
  function pipe(source: WebSocket, target: WebSocket) {
    source.on("message", (data, binary) => {
      if (target.readyState !== WebSocket.OPEN) return;
      // Include a frame header in the queue budget.
      if (
        !Buffer.isBuffer(data) ||
        target.bufferedAmount + data.length + 14 > maxQueue
      )
        return abort();
      target.send(data, { binary }, (error) => {
        if (error) abort();
      });
    });
    source.on("ping", (data) => {
      if (source.readyState !== WebSocket.OPEN) return;
      if (source.bufferedAmount + data.length + 14 > maxQueue) return abort();
      source.pong(data, undefined, (error) => {
        if (error) abort();
      });
    });
    source.on("error", abort);
    source.once("close", (code, reason) => {
      if (target.readyState !== WebSocket.OPEN) return;
      if (code === 1006) target.terminate();
      else if (code === 1005) target.close();
      else target.close(code, reason);
    });
  }
  pipe(browser, cell);
  pipe(cell, browser);
}

server.on("upgrade", (request, socket, head) => {
  const path = URL.parse(request.url ?? "", publicUrl)?.pathname;
  const status =
    path !== "/room"
      ? "404 Not Found"
      : request.headers.origin !== origin
        ? "403 Forbidden"
        : request.headers["sec-websocket-protocol"] !== undefined
          ? "400 Bad Request"
          : null;
  if (status !== null) {
    socket.on("error", () => socket.destroy());
    socket.end(
      `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
    return;
  }
  rooms.handleUpgrade(request, socket, head, (browser) => {
    approved.get(request)!(browser);
  });
});

server.listen(port, "127.0.0.1", () =>
  console.log(`World listening on http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
    for (const browser of rooms.clients) browser.terminate();
    for (const cell of active) cell.terminate();
    rooms.close();
  });
}
