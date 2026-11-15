import { describe, expect, test } from "vitest";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as LegacyTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { identityFixture, mcpIdentityConfig } from "./identity-fixture.js";
import { fixture } from "./service-fixture.js";
import { mcpToolDescriptions } from "../src/mcp-operations.js";

async function setup() {
  const app = await fixture(
    identityFixture().fetch,
    undefined,
    undefined,
    mcpIdentityConfig,
  );
  const user = app.database.upsertUser({
    authSubject: "central-admin",
    username: "admin",
    displayName: "Admin",
    isAdmin: true,
  });
  app.database.createProject(user.id, "Visible fixture", "quake");
  return app;
}

describe("Worldview native MCP clients", () => {
  test("unchanged Executor SDK 1.32.1 discovers all ten tools and reads locally authorized projects", async () => {
    const app = await setup();
    const client = new LegacyClient({
      name: "executor-compatibility",
      version: "1",
    });
    const transport = new LegacyTransport(new URL(`${app.origin}/mcp`), {
      requestInit: { headers: { Authorization: "Bearer test-token" } },
    });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toEqual(mcpToolDescriptions);
      const result = await client.callTool({
        name: "tea_maps_list_projects",
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        projects: [{ name: "Visible fixture" }],
      });
      expect(
        (
          await client.callTool({
            name: "tea_maps_get_project",
            arguments: { projectId: "missing" },
          })
        ).isError,
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("current SDK pinned to 2026 uses native discovery and tool calls", async () => {
    const app = await setup();
    const observed: { method: string | null; version: string | null }[] = [];
    const client = new Client(
      { name: "current-compatibility", version: "1" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(`${app.origin}/mcp`),
      {
        requestInit: { headers: { Authorization: "Bearer test-token" } },
        fetch: async (input, init) => {
          const request = new Request(input, init);
          observed.push({
            method: request.headers.get("Mcp-Method"),
            version: request.headers.get("MCP-Protocol-Version"),
          });
          return fetch(request);
        },
      },
    );
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toEqual(mcpToolDescriptions);
      const result = await client.callTool({
        name: "tea_maps_list_projects",
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        projects: [{ name: "Visible fixture" }],
      });
      expect(
        observed.some(
          (request) =>
            request.method === "server/discover" &&
            request.version === "2026-07-28",
        ),
      ).toBe(true);
      expect(
        observed.some(
          (request) =>
            request.method === "tools/call" && request.version === "2026-07-28",
        ),
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("notifications, batches and oversized bodies cannot create projects", async () => {
    const app = await setup();
    const operation = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "tea_maps_create_project",
        arguments: { name: "Must not exist", game: "quake" },
      },
    };
    for (const [body, status] of [
      [JSON.stringify(operation), 202],
      [JSON.stringify([{ ...operation, id: 1 }]), 400],
      [" ".repeat(3 * 1024 * 1024 + 1), 413],
    ] as const) {
      const response = await fetch(`${app.origin}/mcp`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
        },
        body,
      });
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await response.text();
      expect(
        app.database
          .listProjects(app.database.userByAuthSubject("central-admin")!.id)
          .map((project) => project.name),
      ).toEqual(["Visible fixture"]);
    }
  });
});
