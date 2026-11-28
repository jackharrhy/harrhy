import assert from "node:assert/strict";
import { once } from "node:events";
import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
} from "node:http";
import type { Socket } from "node:net";
import { test, type TestContext } from "node:test";
import { inspect } from "node:util";
import WebSocket, { WebSocketServer } from "ws";
import { createPreview } from "../owner/preview.ts";

const host = "clank.example.test";
const origin = `https://${host}`;
const proxyHeader = "x-p2-proxy-secret";
const cookie = "p2-owner=fixture-session-canary";
const authorization = "Bearer fixture-authorization-canary";
const claim = JSON.stringify({ token: "fixture-claim-canary" });
const setCookies = [
  "p2-owner=fixture-issued-canary; Path=/; Secure; HttpOnly; SameSite=Lax",
  "old-owner=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
];

async function listen(t: TestContext, server: Server) {
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    const closed = once(server, "close");
    server.close();
    for (const socket of sockets) socket.destroy();
    await closed;
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  return address.port;
}

async function body(message: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of message) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

function http(
  port: number,
  method: string,
  path: string,
  headers = {},
  payload?: string,
) {
  return new Promise<{
    status: number | undefined;
    cookies: string[] | undefined;
    text: string;
  }>((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path,
      method,
      headers: { Host: host, ...headers },
      agent: false,
    });
    req.on("response", (res) => {
      void body(res).then(
        (text) =>
          resolve({
            status: res.statusCode,
            cookies: res.headers["set-cookie"],
            text,
          }),
        reject,
      );
    });
    req.on("error", reject);
    req.setTimeout(2_000, () =>
      req.destroy(new Error(`Timeout: ${method} ${path}`)),
    );
    req.end(payload);
  });
}

function received(req: IncomingMessage) {
  return {
    method: req.method,
    path: req.url,
    host: req.headers.host,
    origin: req.headers.origin,
    marker: req.headers[proxyHeader],
    cookie: req.headers.cookie,
    authorization: req.headers.authorization,
    fetchSite: req.headers["sec-fetch-site"],
  };
}

function credentialLogs(t: TestContext) {
  const logs = (["log", "info", "warn", "error", "debug"] as const).map(
    (method) => t.mock.method(console, method, () => {}),
  );
  t.after(() => {
    assert.doesNotMatch(
      logs
        .flatMap((log) => log.mock.calls.flatMap((call) => call.arguments))
        .map((arg) => (typeof arg === "string" ? arg : inspect(arg)))
        .join("\n"),
      /fixture-[\w-]+-canary/,
    );
  });
}

test(
  "owner preview dispatches exact HTTP routes and preserves native Pi auth traffic",
  { timeout: 10_000 },
  async (t) => {
    credentialLogs(t);
    const upstream: (ReturnType<typeof received> & { body: string })[] = [];
    const piPort = await listen(
      t,
      createServer(async (req, res) => {
        upstream.push({ ...received(req), body: await body(req) });
        if (req.url === "/owner/claim") res.setHeader("Set-Cookie", setCookies);
        res.writeHead(200).end("native Pi");
      }),
    );
    const worker: string[] = [];
    const port = await listen(
      t,
      createPreview(piPort, host, (req) => {
        assert.equal(req.headers.has("Cookie"), false);
        worker.push(`${req.method} ${new URL(req.url).pathname}`);
        return new Response("Clank worker");
      }),
    );

    for (const path of ["/", "/owner-sessions.js"]) {
      assert.equal(
        (await http(port, "GET", path, { Cookie: cookie })).text,
        "Clank worker",
      );
    }
    const native = [
      ["GET", "/owner"],
      ["GET", "/owner/check"],
      ["POST", "/owner/claim"],
      ["POST", "/owner/logout"],
    ] as const;
    for (const [method, path] of native) {
      const payload = path === "/owner/claim" ? claim : undefined;
      const headers =
        payload === undefined
          ? {}
          : {
              Origin: origin,
              [proxyHeader]: "fixture-marker-canary",
              Cookie: cookie,
              Authorization: authorization,
              "Sec-Fetch-Site": "same-origin",
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            };
      const res = await http(port, method, path, headers, payload);
      assert.equal(res.text, "native Pi");
      if (payload !== undefined) assert.deepEqual(res.cookies, setCookies);
      assert.deepEqual(upstream.at(-1), {
        method,
        path,
        host,
        origin: payload === undefined ? undefined : origin,
        marker: "clank-preview",
        cookie: payload === undefined ? undefined : cookie,
        authorization: undefined,
        fetchSite: payload === undefined ? undefined : "same-origin",
        body: payload ?? "",
      });
    }
    for (const [method, path] of [
      ["POST", "/"],
      ["HEAD", "/owner-sessions.js"],
      ["GET", "/owner-sessions.js/"],
      ["POST", "/owner"],
      ["POST", "/owner/check"],
      ["GET", "/owner/claim"],
      ["GET", "/owner/logout"],
      ["GET", "/owner/"],
      ["GET", "/owner-token"],
      ["POST", "/owner/logout-all"],
      ["GET", "/chord"],
    ] as const) {
      assert.equal(
        (await http(port, method, path)).status,
        404,
        `${method} ${path}`,
      );
    }
    assert.equal(
      (await http(port, "GET", "/owner/check", { Host: "127.0.0.1" })).status,
      404,
    );
    assert.equal((await http(port, "GET", "/owner/check?extra=1")).status, 404);
    assert.equal(upstream.length, native.length);
    assert.deepEqual(worker, ["GET /", "GET /owner-sessions.js"]);
  },
);

test(
  "owner preview passes Chord upgrades through Pi's Origin and auth checks",
  { timeout: 10_000 },
  async (t) => {
    credentialLogs(t);
    const upgrades: ReturnType<typeof received>[] = [];
    const wss = new WebSocketServer({ noServer: true });
    const pi = createServer();
    pi.on("upgrade", (req, socket, head) => {
      upgrades.push(received(req));
      if (
        (req.headers.origin !== undefined && req.headers.origin !== origin) ||
        req.headers.cookie !== cookie
      ) {
        socket.end(
          "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
        );
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.on("error", () => {});
        ws.on("message", (data, binary) => ws.send(data, { binary }));
      });
    });
    const piPort = await listen(t, pi);
    let workerCalls = 0;
    const port = await listen(
      t,
      createPreview(piPort, host, () => {
        workerCalls++;
        return new Response(null, { status: 404 });
      }),
    );
    const path = "/chord?client=script";
    function connect(headers: Record<string, string>, target = path) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}${target}`, {
        headers: { Host: host, ...headers },
        handshakeTimeout: 2_000,
      });
      ws.on("error", () => {});
      t.after(() => ws.terminate());
      return ws;
    }

    const ws = connect({
      Origin: origin,
      Cookie: cookie,
      [proxyHeader]: "fixture-ws-canary",
    });
    await once(ws, "open");
    const echo = once(ws, "message", { signal: AbortSignal.timeout(2_000) });
    const frame = Buffer.from([0, 127, 255]);
    ws.send(frame);
    assert.deepEqual(await echo, [frame, true]);
    const closed = once(ws, "close", { signal: AbortSignal.timeout(2_000) });
    ws.close();
    await closed;

    const foreign = "https://foreign.example";
    await assert.rejects(
      once(connect({ Origin: foreign, Cookie: cookie }), "open"),
      /Unexpected server response: 403/,
    );
    await assert.rejects(
      once(connect({ Origin: origin }), "open"),
      /Unexpected server response: 403/,
    );
    await assert.rejects(
      once(connect({ Origin: origin, Cookie: cookie }, "/chord/"), "open"),
    );
    assert.deepEqual(upgrades, [
      {
        method: "GET",
        path,
        host,
        origin,
        marker: "clank-preview",
        cookie,
        authorization: undefined,
        fetchSite: undefined,
      },
      {
        method: "GET",
        path,
        host,
        origin: foreign,
        marker: "clank-preview",
        cookie,
        authorization: undefined,
        fetchSite: undefined,
      },
      {
        method: "GET",
        path,
        host,
        origin,
        marker: "clank-preview",
        cookie: undefined,
        authorization: undefined,
        fetchSite: undefined,
      },
    ]);
    assert.equal(workerCalls, 0);
  },
);
