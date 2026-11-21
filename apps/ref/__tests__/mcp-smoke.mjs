import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as LegacyTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chromium } from "@playwright/test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const origin = new URL(process.env.REF_SMOKE_URL ?? "");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname),
  "Local fixtures only",
);
assert.equal(origin.protocol, "http:");
assert.equal(origin.pathname, "/");
const tokenPath = process.env.REF_ACCESS_TOKEN_FILE;
const resultPath = process.env.REF_MCP_RESULT_FILE;
assert.ok(
  tokenPath && resultPath,
  "Explicit private token and result files required",
);
assert.equal((await stat(tokenPath)).mode & 0o077, 0, "Token must be private");
const token = (await readFile(tokenPath, "utf8")).trim();
const currentVersion = JSON.parse(
  await readFile(
    new URL(
      "../package.json",
      import.meta.resolve("@modelcontextprotocol/client"),
    ),
    "utf8",
  ),
).version;
const legacyVersion = JSON.parse(
  await readFile(
    new URL(
      "../../../package.json",
      import.meta.resolve("@modelcontextprotocol/sdk/client/index.js"),
    ),
    "utf8",
  ),
).version;
assert.equal(legacyVersion, "1.32.1");
assert.equal(currentVersion, "2.4.0");
const clients = [];
let browser;
const headers = { Authorization: `Bearer ${token}` };
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=";
const geometry = { x: 10, y: 20, width: 120, height: 100, rotation: 0, z: 1 };
async function privateHeaders(path) {
  assert.ok(path, "Explicit private scoped token file required");
  assert.equal((await stat(path)).mode & 0o077, 0, "Token must be private");
  return { Authorization: `Bearer ${(await readFile(path, "utf8")).trim()}` };
}
async function connect(C, T, authorization = headers, count = 13) {
  const client = new C({ name: "ref-isolated-smoke", version: "1.0.0" });
  clients.push(client);
  await client.connect(
    new T(new URL("/mcp", origin), { requestInit: { headers: authorization } }),
  );
  assert.equal((await client.listTools()).tools.length, count);
  return client;
}
async function call(client, name, args = {}, error = false) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(
    result.isError === true,
    error,
    `${name}: unexpected tool status`,
  );
  if (error && !result.structuredContent) return result.content[0].text;
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}
async function media(boardId, assetId, status = 200, authorization = headers) {
  const response = await fetch(
    new URL(`/media/${boardId}/${assetId}`, origin),
    {
      headers: authorization,
    },
  );
  assert.equal(response.status, status);
  if (status === 200)
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      Buffer.from(png, "base64"),
    );
}
try {
  const current = await connect(Client, StreamableHTTPClientTransport);
  const old = await connect(LegacyClient, LegacyTransport);
  if (process.env.REF_MCP_PHASE === "verify") {
    const saved = JSON.parse(await readFile(resultPath, "utf8"));
    const snapshot = await call(old, "board_get", { boardId: saved.boardId });
    assert.equal(snapshot.items.length, 1);
    assert.deepEqual(snapshot.items[0], saved.item);
    assert.equal(snapshot.sequence, saved.sequence);
    await media(saved.boardId, saved.assetId);
    await call(current, "item_remove", {
      boardId: saved.boardId,
      itemId: saved.item.id,
      baseRevision: saved.item.revision,
      operationId: randomUUID(),
    });
    assert.equal(
      (await call(old, "board_get", { boardId: saved.boardId })).items.length,
      0,
    );
    await media(saved.boardId, saved.assetId, 404);
    await call(
      old,
      "asset_get",
      { boardId: saved.boardId, assetId: saved.assetId },
      true,
    );
  } else {
    assert.equal(
      (await fetch(new URL("/mcp", origin), { method: "POST" })).status,
      401,
    );
    const readHeaders = await privateHeaders(process.env.REF_READ_TOKEN_FILE);
    const writeHeaders = await privateHeaders(process.env.REF_WRITE_TOKEN_FILE);
    const mixedHeaders = await privateHeaders(process.env.REF_MIXED_TOKEN_FILE);
    const reader = await connect(
      Client,
      StreamableHTTPClientTransport,
      readHeaders,
      5,
    );
    const writer = await connect(
      Client,
      StreamableHTTPClientTransport,
      writeHeaders,
      8,
    );
    await call(writer, "export_start", {}, true);
    await call(writer, "export_status", { id: randomUUID() }, true);
    const beforeDeniedCreate = await call(current, "boards_list");
    await call(reader, "board_create", { title: "Must not be created" }, true);
    assert.deepEqual(await call(current, "boards_list"), beforeDeniedCreate);
    assert.equal(
      (
        await fetch(new URL("/mcp", origin), {
          method: "POST",
          headers: {
            ...mixedHeaders,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {},
          }),
        })
      ).status,
      403,
    );
    const { board } = await call(old, "board_create", {
      title: "Isolated MCP smoke",
    });
    const boardId = board.id;
    const [concurrentRead] = await Promise.all([
      call(current, "board_get", { boardId }),
      call(old, "board_get", { boardId: "not-a-board-id" }, true),
    ]);
    assert.equal(concurrentRead.board.id, boardId);
    await call(current, "board_rename", {
      boardId,
      title: "Isolated MCP persistence",
    });
    assert.ok(
      (await call(old, "boards_list")).boards.some(
        (b) => b.id === boardId && b.title === "Isolated MCP persistence",
      ),
    );
    const asset = await call(current, "asset_upload", {
      boardId,
      filename: "synthetic.png",
      base64: png,
    });
    const assetId = asset.assetId;
    await call(writer, "board_get", { boardId }, true);
    assert.equal(
      (await call(reader, "board_get", { boardId })).board.id,
      boardId,
    );
    const descriptor = await call(reader, "asset_get", { boardId, assetId });
    assert.equal(descriptor.contentType, "image/png");
    await media(boardId, assetId, 200, readHeaders);
    await media(boardId, assetId, 403, writeHeaders);
    const firstId = randomUUID(),
      secondId = randomUUID();
    for (const itemId of [firstId, secondId])
      await call(current, "item_create", {
        boardId,
        itemId,
        assetId,
        operationId: randomUUID(),
        ...geometry,
      });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(origin.href);
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Continue as local user" }).click();
    const cookie = (await page.context().cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    assert.equal(
      (
        await fetch(new URL("/mcp", origin), {
          method: "POST",
          headers: { Cookie: cookie, Origin: "https://foreign.invalid" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(new URL("/mcp", origin), {
          method: "POST",
          headers: { Cookie: cookie },
        })
      ).status,
      401,
    );
    const frames = [];
    page.on("websocket", (socket) =>
      socket.on("framereceived", ({ payload }) => {
        try {
          frames.push(JSON.parse(String(payload)));
        } catch {}
      }),
    );
    await page.goto(new URL(`/boards/${boardId}`, origin).href);
    await page.locator("#connection.online").waitFor();
    await page.locator(`.board-item[data-item-id="${firstId}"]`).waitFor();
    const operation = {
      boardId,
      itemId: firstId,
      operationId: randomUUID(),
      baseRevision: 1,
      ...geometry,
      x: 321,
    };
    const transformed = await call(old, "item_transform", operation);
    assert.equal(transformed.revision, 2);
    await page.waitForFunction(
      (id) =>
        document.querySelector(`.board-item[data-item-id="${id}"]`)?.style
          .left === "321px",
      firstId,
    );
    assert.ok(
      frames.some(
        (f) =>
          f.type === "applied" &&
          f.operationId === operation.operationId &&
          f.item.revision === 2,
      ),
      "Browser received MCP broadcast",
    );
    const replay = await call(current, "item_transform", operation);
    assert.equal(replay.sequence, transformed.sequence);
    const conflict = await call(
      current,
      "item_transform",
      { ...operation, operationId: randomUUID(), x: 999 },
      true,
    );
    assert.equal(conflict.applied, false);
    const privateConflict = await call(
      writer,
      "item_transform",
      {
        ...operation,
        operationId: randomUUID(),
        x: 999,
      },
      true,
    );
    assert.equal(privateConflict.applied, false);
    assert.equal(Object.hasOwn(privateConflict, "snapshot"), false);
    assert.equal(
      (await call(reader, "board_get", { boardId })).items.find(
        (item) => item.id === firstId,
      ).revision,
      2,
    );
    assert.equal(
      (await call(old, "board_get", { boardId })).sequence,
      transformed.sequence,
    );
    await call(current, "item_remove", {
      boardId,
      itemId: firstId,
      baseRevision: 2,
      operationId: randomUUID(),
    });
    await page
      .locator(`.board-item[data-item-id="${firstId}"]`)
      .waitFor({ state: "detached" });
    await media(boardId, assetId);
    const saved = await call(old, "board_get", { boardId });
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].id, secondId);
    await writeFile(
      resultPath,
      JSON.stringify({
        boardId,
        assetId,
        item: saved.items[0],
        sequence: saved.sequence,
      }),
      { mode: 0o600, flag: "wx" },
    );
  }
  console.log(
    JSON.stringify({
      ok: true,
      phase: process.env.REF_MCP_PHASE ?? "create",
      clients: [legacyVersion, currentVersion],
    }),
  );
} finally {
  await browser?.close();
  await Promise.all(clients.map((client) => client.close()));
}
