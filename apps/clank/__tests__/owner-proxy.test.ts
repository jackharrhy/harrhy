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
import { createPreview } from "../app/server/preview.ts";

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
  payload?: string | Buffer,
) {
  return new Promise<{
    status: number | undefined;
    headers: IncomingMessage["headers"];
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
            headers: res.headers,
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

const diagramPath = "/owner/diagram";
function diagramHeaders(port: number) {
  return {
    Origin: origin,
    "Content-Type": "text/plain; charset=UTF-8",
    Cookie: `p2_owner_${port}=${"a".repeat(32)}.123.${"b".repeat(64)}`,
  };
}

test("diagram source reaches only the renderer, after a fresh affirmative Pi check", async (t) => {
  credentialLogs(t);
  const checks: (ReturnType<typeof received> & { body: string })[] = [];
  let status = 200;
  let reply = '{"owner":true}';
  const pi = await listen(
    t,
    createServer(async (req, res) => {
      checks.push({ ...received(req), body: await body(req) });
      if (status === 0) return req.socket.destroy();
      res
        .writeHead(status, {
          Location: "/not-an-owner-check",
          "Set-Cookie": setCookies,
        })
        .end(reply);
    }),
  );
  const render = t.mock.fn((source: string) =>
    source === "α → β" ? "<svg/>" : null,
  );
  const port = await listen(
    t,
    createPreview(
      pi,
      host,
      () => assert.fail("unexpected document request"),
      undefined,
      render,
    ),
  );
  const headers = diagramHeaders(pi);
  const post = (source: string | Buffer, overrides = {}) =>
    http(
      port,
      "POST",
      diagramPath,
      {
        ...headers,
        Cookie: `unrelated=fixture-other-canary; ${headers.Cookie}`,
        Authorization: authorization,
        [proxyHeader]: "fixture-fake-canary",
        ...overrides,
      },
      source,
    );
  for (const [source, svg] of [
    ["α → β", "<svg/>"],
    ["unsupported", null],
  ] as const) {
    const res = await post(source);
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.text), { svg });
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.match(res.headers["content-type"] ?? "", /^application\/json/);
    assert.equal(res.cookies, undefined);
    assert.deepEqual(render.mock.calls.at(-1)?.arguments, [source]);
  }
  const denied = [
    [0, ""],
    [401, '{"owner":true}'],
    [302, '{"owner":true}'],
    [201, '{"owner":true}'],
    [200, '{"owner":"true"}'],
    [200, '{"owner":false}'],
    [200, "{}"],
    [200, "invalid"],
    [200, " ".repeat(1024) + '{"owner":true}'],
  ] as const;
  for (const [code, payload] of denied) {
    status = code;
    reply = payload;
    const res = await post("fixture-source-canary");
    assert.equal(res.status, 403);
    assert.equal(res.text, "");
  }
  assert.equal(checks.length, 2 + denied.length);
  for (const check of checks)
    assert.deepEqual(check, {
      method: "GET",
      path: "/owner/check",
      host,
      origin,
      cookie: headers.Cookie,
      marker: "clank-preview",
      authorization: undefined,
      fetchSite: undefined,
      body: "",
    });

  for (const overrides of [
    { Origin: "" },
    { Origin: origin + "/" },
    { Origin: "https://elsewhere.test" },
    { "Sec-Fetch-Site": "cross-site" },
    { Cookie: cookie },
    { Cookie: headers.Cookie + "; " + headers.Cookie },
  ])
    assert.equal((await post("source", overrides)).status, 403);
  assert.equal((await post("source", { Host: "localhost" })).status, 404);
  assert.equal((await http(port, "GET", diagramPath, headers)).status, 404);
  assert.equal(
    (await http(port, "POST", diagramPath + "?query", headers)).status,
    404,
  );
  assert.equal(
    (await post("x", { "Content-Type": "text/plain; charset=ascii" })).status,
    415,
  );
  assert.equal((await post(Buffer.from([0xff]))).status, 400);
  const oversized = "é".repeat(20_001);
  assert.equal((await post(oversized)).status, 413);
  assert.equal(
    (await post(oversized, { "Transfer-Encoding": "chunked" })).status,
    413,
  );
  assert.equal(checks.length, 2 + denied.length);
  assert.equal(render.mock.callCount(), 2);
});

test(
  "unfinished diagram uploads occupy slots before auth and expire",
  { timeout: 10_000 },
  async (t) => {
    let checks = 0;
    const pi = await listen(
      t,
      createServer((_req, res) => {
        checks++;
        res.end('{"owner":true}');
      }),
    );
    const preview = createPreview(
      pi,
      host,
      () => assert.fail("unexpected document request"),
      undefined,
      () => null,
    );
    const port = await listen(t, preview);
    const headers = diagramHeaders(pi);
    const replies: Promise<number | undefined>[] = [];
    for (let i = 0; i < 4; i++) {
      const arrived = once(preview, "request");
      const req = request({
        host: "127.0.0.1",
        port,
        method: "POST",
        path: diagramPath,
        headers: { Host: host, ...headers, "Content-Length": 2 },
        agent: false,
      });
      replies.push(
        new Promise((resolve, reject) => {
          req.on("error", reject);
          req.on("response", (res) => {
            res.resume();
            resolve(res.statusCode);
          });
        }),
      );
      req.write("x");
      await arrived;
    }
    assert.equal(
      (await http(port, "POST", diagramPath, headers, "ok")).status,
      429,
    );
    assert.deepEqual(await Promise.all(replies), [408, 408, 408, 408]);
    assert.equal(checks, 0);
    assert.equal(
      (await http(port, "POST", diagramPath, headers, "ok")).status,
      200,
    );
    assert.equal(checks, 1);
  },
);
