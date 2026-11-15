import { expect, test } from "bun:test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as LegacyTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApplication } from "../src/http-app.ts";
import type { Config } from "../src/config.ts";
import * as schema from "../src/db/schema.ts";
import { mintApiToken } from "../src/services/api-tokens.ts";
import { mcpTools } from "../src/operations/catalog.ts";
import { createTestDb, seedList } from "./helpers.ts";
import { mcpHeaders } from "./mcp-fixture.ts";

const config: Config = {
  awsRegion: "us-east-1",
  sqsQueueUrl: "queue",
  s3Bucket: "bucket",
  dbPath: ":memory:",
  fromDomain: "example.com",
  baseUrl: "http://localhost",
  sesConfigSet: "config",
  s3MediaBucket: "",
  s3MediaBaseUrl: "",
  ownerEmail: "",
  ownerPassword: "",
};
function setup() {
  const db = createTestDb();
  const user = db
    .insert(schema.users)
    .values({
      email: "member@example.com",
      passwordHash: "hash",
      role: "member",
    })
    .returning()
    .get();
  const allowed = seedList(db, { slug: "allowed", name: "Allowed" });
  const denied = seedList(db, { slug: "denied", name: "Denied" });
  db.insert(schema.userLists)
    .values({ userId: user.id, listId: allowed.id })
    .run();
  const { token } = mintApiToken(
    db,
    user.id,
    "fixture",
    ["lists:read", "subscribers:write"],
    null,
    "http://localhost/mcp",
  );
  const app = createApplication(db, config);
  const requestFetch = (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => app.fetch(new Request(input, init));
  return { db, app, allowed, denied, token, requestFetch };
}

test("Executor SDK 1.32.1 discovers all 25 tools, preserves array envelopes and local list ACL", async () => {
  const fixture = setup();
  const client = new LegacyClient({
    name: "executor-compatibility",
    version: "1",
  });
  const transport = new LegacyTransport(new URL("http://localhost/mcp/"), {
    fetch: fixture.requestFetch,
    requestInit: { headers: { Authorization: `Bearer ${fixture.token}` } },
  });
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools).toEqual(mcpTools);
    const result = await client.callTool({ name: "lists_list", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      items: [{ id: fixture.allowed.id }],
    });
    expect(
      (
        await client.callTool({
          name: "list_stats",
          arguments: { id: fixture.denied.id },
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await client.callTool({
          name: "campaigns_list",
          arguments: { limit: 1 },
        })
      ).isError,
    ).toBe(true);
  } finally {
    await client.close();
  }
});

test("current SDK pinned to native 2026 preserves the same catalog and array-valued read", async () => {
  const fixture = setup();
  const client = new Client(
    { name: "current-compatibility", version: "1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const requests: Headers[] = [];
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost/mcp"),
    {
      requestInit: { headers: { Authorization: `Bearer ${fixture.token}` } },
      fetch: (input, init) => {
        const request = new Request(input, init);
        requests.push(request.headers);
        return fixture.app.fetch(request);
      },
    },
  );
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools).toEqual(mcpTools);
    const result = await client.callTool({ name: "lists_list", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      items: [{ id: fixture.allowed.id }],
    });
    expect(
      requests.some(
        (headers) =>
          headers.get("Mcp-Method") === "server/discover" &&
          headers.get("MCP-Protocol-Version") === "2026-07-28",
      ),
    ).toBe(true);
    expect(
      requests.some(
        (headers) =>
          headers.get("Mcp-Method") === "tools/call" &&
          headers.get("MCP-Protocol-Version") === "2026-07-28",
      ),
    ).toBe(true);
  } finally {
    await client.close();
  }
});

test("notifications, batches, cross-origin and oversized requests never create subscribers", async () => {
  const fixture = setup();
  const operation = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "subscriber_create",
      arguments: { email: "must-not-exist@example.com", lists: ["allowed"] },
    },
  };
  const headers = {
    ...mcpHeaders,
    Authorization: `Bearer ${fixture.token}`,
    "Content-Type": "application/json",
  };
  let remaining = 129;
  const chunk = new Uint8Array(1024 * 1024).fill(32);
  const oversized = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (remaining-- > 0) controller.enqueue(chunk);
      else controller.close();
    },
  });
  for (const [body, status] of [
    [JSON.stringify(operation), 202],
    [JSON.stringify([{ ...operation, id: 1 }]), 400],
    [oversized, 413],
  ] as const) {
    const response = await fixture.app.request("/mcp", {
      method: "POST",
      headers,
      body,
    });
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await response.text();
  }
  expect(
    (
      await fixture.app.request("/mcp", {
        method: "POST",
        headers: { ...headers, Origin: "https://untrusted.example" },
        body: JSON.stringify({ ...operation, id: 1 }),
      })
    ).status,
  ).toBe(403);
  expect(fixture.db.select().from(schema.subscribers).all()).toEqual([]);
});
