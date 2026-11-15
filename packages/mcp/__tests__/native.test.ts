import assert from "node:assert/strict";
import { test } from "node:test";
import { createNativeHandler, Server } from "../src/native.ts";

for (const contentLength of [undefined, "1"]) {
  test(`rejects actual oversized input with ${contentLength === undefined ? "no" : "understated"} Content-Length and cancels the stream`, async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12345678"));
        controller.enqueue(new TextEncoder().encode("9"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const handler = createNativeHandler(
      () => {
        assert.fail("oversized input must not reach the SDK server factory");
      },
      { maxRequestBytes: 8 },
    );
    const headers = new Headers({ "content-type": "application/json" });
    if (contentLength !== undefined)
      headers.set("content-length", contentLength);
    const options = { method: "POST", headers, body, duplex: "half" as const };

    const response = await handler.fetch(
      new Request("https://example.test/mcp", options),
    );

    assert.equal(response.status, 413);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(cancelled, true);
  });
}

test("leaves malformed JSON errors to the SDK", async () => {
  const handler = createNativeHandler(
    () => new Server({ name: "boundary-test", version: "1.0.0" }),
    { maxRequestBytes: 1_024 },
  );
  const response = await handler.fetch(
    new Request("https://example.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: "{",
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).error.code, -32700);
});

test("passes a legacy tool call larger than the SDK default body limit", async () => {
  const payload = "x".repeat(4 * 1024 * 1024 + 1);
  let receivedLength: number | undefined;
  const handler = createNativeHandler(
    () => {
      const server = new Server(
        { name: "boundary-test", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );
      server.setRequestHandler("tools/call", (message) => {
        const value = message.params.arguments?.payload;
        assert.ok(typeof value === "string");
        receivedLength = value.length;
        return { content: [{ type: "text", text: "accepted" }] };
      });
      return server;
    },
    { maxRequestBytes: 8 * 1024 * 1024 },
  );

  const response = await handler.fetch(
    new Request("https://example.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "accept", arguments: { payload } },
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  const data = response.headers
    .get("content-type")
    ?.startsWith("text/event-stream")
    ? text
        .split(/\r?\n/)
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim()
    : text;
  assert.ok(data, "SDK must return a JSON-RPC response");
  assert.deepEqual(JSON.parse(data), {
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text: "accepted" }] },
  });
  assert.equal(receivedLength, payload.length);
});

test(
  "bounds stalled input and cancels its reader",
  { timeout: 2_000 },
  async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const handler = createNativeHandler(
      () => {
        assert.fail("incomplete input must not reach the SDK server factory");
      },
      { maxRequestBytes: 1_024, requestTimeoutMs: 10 },
    );
    const options = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half" as const,
    };

    const response = await handler.fetch(
      new Request("https://example.test/mcp", options),
    );

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(cancelled, true);
  },
);
