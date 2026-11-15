import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as LegacyTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as s from "@harrhy/json-schema";
import { z } from "zod";
import {
  bindTool,
  createNativeHandler,
  defineTool,
  Server,
  type CallToolResult,
} from "../src/index.ts";

test("accepts existing Zod contracts without a second validator or schema declaration", async () => {
  const definition = defineTool({
    name: "zod",
    input: z.object({ value: z.string().trim() }).strict(),
    output: z.object({ value: z.string() }).strict(),
  });
  const execute = bindTool(
    definition,
    (input) => ({
      content: [{ type: "text", text: input.value }],
      structuredContent: input,
    }),
    validation,
  );
  assert.deepEqual(
    (await execute({ value: "  trimmed  " })).structuredContent,
    { value: "trimmed" },
  );
  assert.equal((await execute({ value: "ok", extra: true })).isError, true);
});

const definition = defineTool({
  name: "measure",
  description: "Measure a string using authorized app state.",
  input: s.object(
    { text: s.string().transform((value) => value.length, s.number()) },
    { unknownKeys: "error" },
  ),
  output: s.object({ length: s.number() }, { unknownKeys: "error" }),
  annotations: { readOnlyHint: true },
});
const failure = (text: string): CallToolResult & { isError: true } => ({
  isError: true,
  content: [{ type: "text", text }],
});
const validation = {
  invalidInput: () => failure("Invalid arguments"),
  invalidOutput: () => failure("Internal error"),
};

for (const generation of ["legacy", "modern"] as const) {
  test(`${generation} real client discovers and calls typed bindings without owning protocol or app error policy`, async () => {
    let calls = 0;
    let mode: "normal" | "invalid-output" | "expected" | "unexpected" =
      "normal";
    const authorizedOffset = 10;
    const execute = bindTool(
      definition,
      ({ text }) => {
        calls++;
        if (mode === "expected") return failure("Expected application error");
        if (mode === "unexpected")
          throw new Error("private database credential");
        const length =
          mode === "invalid-output"
            ? ("bad" as unknown as number)
            : text + authorizedOffset;
        return {
          content: [{ type: "text", text: JSON.stringify({ length }) }],
          structuredContent: { length },
        };
      },
      validation,
    );
    const handler = createNativeHandler(
      () => {
        const server = new Server(
          { name: "typed-fixture", version: "1" },
          { capabilities: { tools: {} } },
        );
        server.setRequestHandler("tools/list", () => ({
          tools: [definition.descriptor],
        }));
        server.setRequestHandler("tools/call", async (message) => {
          if (message.params.name !== definition.descriptor.name)
            return failure("Unknown tool");
          try {
            return server.projectCallToolResult(
              await execute(message.params.arguments ?? {}),
              definition.descriptor.outputSchema,
            );
          } catch {
            return failure("Internal error");
          }
        });
        return server;
      },
      { maxRequestBytes: 64 * 1024 },
    );
    const options = {
      fetch: (input: string | URL | Request, init?: RequestInit) =>
        handler.fetch(new Request(input, init)),
    };
    const url = new URL("https://fixture.test/mcp");
    const client =
      generation === "legacy"
        ? new LegacyClient({ name: "executor-fixture", version: "1" })
        : new Client(
            { name: "current-fixture", version: "1" },
            { versionNegotiation: { mode: { pin: "2026-07-28" } } },
          );
    try {
      if (generation === "legacy")
        await (client as LegacyClient).connect(
          new LegacyTransport(url, options),
        );
      else
        await (client as Client).connect(
          new StreamableHTTPClientTransport(url, options),
        );
      assert.deepEqual((await client.listTools()).tools, [
        definition.descriptor,
      ]);
      assert.deepEqual(definition.descriptor.inputSchema.properties, {
        text: { type: "string" },
      });
      const result = await client.callTool({
        name: "measure",
        arguments: { text: "abc" },
      });
      assert.deepEqual(result.structuredContent, { length: 13 });
      const invalid = await client.callTool({
        name: "measure",
        arguments: { text: 123 },
      });
      assert.equal(invalid.isError, true);
      assert.deepEqual(invalid.content, [
        { type: "text", text: "Invalid arguments" },
      ]);
      assert.equal(calls, 1);
      for (const next of [
        "invalid-output",
        "expected",
        "unexpected",
      ] as const) {
        mode = next;
        const error = await client.callTool({
          name: "measure",
          arguments: { text: "abc" },
        });
        assert.equal(error.isError, true);
        assert.deepEqual(error.content, [
          {
            type: "text",
            text:
              next === "expected"
                ? "Expected application error"
                : "Internal error",
          },
        ]);
        assert.equal(error.structuredContent, undefined);
      }
    } finally {
      await client.close();
    }
  });
}

test("awaits Standard Schema validation and projects its transformed structured output", async () => {
  const output = s.object({
    length: s.number().transform((value) => String(value + 1), s.string()),
  });
  const declared = defineTool({ name: "async", input: s.object({}), output });
  assert.deepEqual(declared.descriptor.outputSchema?.properties, {
    length: { type: "string" },
  });
  const asynchronous = {
    ...declared,
    input: {
      ...declared.input,
      "~standard": {
        ...declared.input["~standard"],
        validate: async (value: unknown) =>
          declared.input["~standard"].validate(value),
      },
    },
  };
  const execute = bindTool(
    asynchronous,
    () => ({ content: [], structuredContent: { length: 1 } }),
    validation,
  );
  assert.deepEqual((await execute({})).structuredContent, { length: "2" });
});
