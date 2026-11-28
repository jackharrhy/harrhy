import type { Snapshot } from "../pi/catalog.ts";
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
} from "node:http";
import {
  serveDiagram,
  rejectDiagram,
  type RenderDiagram,
} from "./diagram-request.ts";
import { CHORD_PATH, SESSION_LIST_PATH, sessionKey } from "../routes.ts";
import {
  readThemeCookie,
  readTintCookie,
  type Tint,
  type Mode,
} from "../settings/theme-cookie.ts";

const uiPaths = new Set([
  "GET /",
  "GET /owner-sessions.js",
  "GET " + SESSION_LIST_PATH,
]);
const piPaths = new Set([
  "GET /owner",
  "GET /owner/check",
  "POST /owner/claim",
  "POST /owner/logout",
]);
const piHeaders = [
  "host",
  "origin",
  "cookie",
  "content-type",
  "content-length",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
];
const wsHeaders = [
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-protocol",
  "sec-websocket-extensions",
];

function forward(port: number, incoming: IncomingMessage, upgrade = false) {
  const headers: IncomingHttpHeaders = { "x-p2-proxy-secret": "clank-preview" };
  for (const name of upgrade ? [...piHeaders, ...wsHeaders] : piHeaders) {
    if (incoming.headers[name] !== undefined)
      headers[name] = incoming.headers[name];
  }
  if (upgrade)
    Object.assign(headers, { connection: "Upgrade", upgrade: "websocket" });
  return request({
    hostname: "127.0.0.1",
    port,
    path: incoming.url,
    method: incoming.method,
    headers,
    agent: false,
    timeout: 8000,
  });
}

function responseHeaders(headers: IncomingHttpHeaders) {
  const result = { ...headers };
  for (const name of [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    ...(headers.connection ?? "")
      .toLowerCase()
      .split(",")
      .map((header) => header.trim()),
  ]) {
    delete result[name];
  }
  return result;
}

export function createPreview(
  piPort: number,
  ownerHost: string,
  serve: (
    request: Request,
    snapshot?: Snapshot,
    mode?: Mode,
    tint?: Tint,
  ) => Response | Promise<Response>,
  snapshot?: (
    request: IncomingMessage,
    signal: AbortSignal,
  ) => Promise<Snapshot | undefined>,
  renderDiagram?: RenderDiagram,
) {
  let pendingDiagrams = 0;
  const server = createServer((req, res) => {
    const route = `${req.method} ${req.url}`;
    const diagram = route === "POST /owner/diagram" && renderDiagram;
    const ui =
      uiPaths.has(route) ||
      (req.method === "GET" &&
        req.url !== undefined &&
        sessionKey(req.url) !== undefined);
    if (
      req.headers.host !== ownerHost ||
      req.headers.upgrade ||
      (req.method === "GET" &&
        (req.headers["content-length"] || req.headers["transfer-encoding"])) ||
      (!piPaths.has(route) && !ui && !diagram)
    ) {
      res.writeHead(404, { "Cache-Control": "no-store" }).end();
      return;
    }
    if (diagram) {
      if (pendingDiagrams >= 4) return rejectDiagram(res, 429);
      pendingDiagrams++;
      void serveDiagram(req, res, piPort, ownerHost, diagram)
        .catch(() => rejectDiagram(res, 500))
        .finally(() => {
          pendingDiagrams--;
        });
      return;
    }
    if (ui) {
      // The renderer receives data only, never browser credentials.
      const abort = new AbortController();
      res.once("close", () => abort.abort());
      void Promise.resolve()
        .then(async () => {
          const data =
            req.url !== "/owner-sessions.js"
              ? await snapshot?.(req, abort.signal)
              : undefined;
          if (abort.signal.aborted) return;
          return serve(
            new Request(`https://${ownerHost}${req.url}`, {
              signal: abort.signal,
            }),
            data,
            readThemeCookie(req.headers.cookie),
            readTintCookie(req.headers.cookie),
          );
        })
        .then(async (response) => {
          if (!response) return;
          const body = Buffer.from(await response.arrayBuffer());
          res
            .writeHead(response.status, Object.fromEntries(response.headers))
            .end(body);
        })
        .catch(() => res.writeHead(500).end());
      return;
    }
    const upstream = forward(piPort, req);
    upstream.on("response", (response) => {
      res.writeHead(
        response.statusCode ?? 502,
        responseHeaders(response.headers),
      );
      response.on("error", () => res.destroy());
      response.pipe(res);
    });
    upstream.on("timeout", () => upstream.destroy(new Error("Pi timeout")));
    upstream.on("error", () => {
      if (res.headersSent) res.destroy();
      else res.writeHead(502, { "Cache-Control": "no-store" }).end();
    });
    res.on("close", () => upstream.destroy());
    req.on("error", () => upstream.destroy());
    req.pipe(upstream);
  });
  // Never let Node log raw HTTP parse errors, whose packets can contain cookies.
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    socket.on("end", () => socket.destroy());
    if (
      req.headers.host !== ownerHost ||
      req.method !== "GET" ||
      req.url !== CHORD_PATH ||
      req.headers.upgrade?.toLowerCase() !== "websocket" ||
      req.headers["content-length"] ||
      req.headers["transfer-encoding"]
    ) {
      socket.end(
        "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
      return;
    }
    const upstream = forward(piPort, req, true);
    const refuse = (status: number) => {
      socket.end(
        `HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
    };
    upstream.on("timeout", () => upstream.destroy(new Error("Pi timeout")));
    upstream.on("error", () => refuse(502));
    upstream.on("response", (response) => {
      response.resume();
      refuse(response.statusCode ?? 502);
    });
    socket.once("close", () => upstream.destroy());
    upstream.on("upgrade", (response, peer, peerHead) => {
      peer.on("error", () => socket.destroy());
      peer.on("end", () => socket.end());
      peer.on("close", () => socket.destroy());
      if (socket.destroyed || response.statusCode !== 101)
        return void peer.destroy();
      // No HTTP parser or Chord logic between the peers once Pi admitted the upgrade.
      peer.setTimeout(0);
      const handshake = [
        "HTTP/1.1 101 Switching Protocols",
        "Connection: Upgrade",
        "Upgrade: websocket",
      ];
      for (const name of ["sec-websocket-accept", ...wsHeaders.slice(2)]) {
        const value = response.headers[name];
        if (typeof value === "string") handshake.push(`${name}: ${value}`);
      }
      socket.write(`${handshake.join("\r\n")}\r\n\r\n`);
      if (peerHead.length) socket.write(peerHead);
      if (head.length) peer.write(head);
      socket.once("close", () => peer.destroy());
      socket.pipe(peer).pipe(socket);
    });
    upstream.end();
  });
  return server;
}
