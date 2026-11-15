import { it } from "remix/test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as LegacyTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseFixtureSites } from "./sites.ts";
import { createApp } from "../app.ts";
import { seedFixture } from "./fixture.ts";
import { openDatabase } from "../app/data/database.ts";
import { createContentStore } from "../app/data/content.ts";

it("keeps MCP disabled without credentials and serves only the selected site's published reads to both SDK generations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "teacms-mcp-"));
  const sites = parseFixtureSites(
    ["one", "two"].map((id) => ({
      id,
      template: "andrew",
      name: id,
      origin: `https://${id}.example.test`,
      aliases: [],
      preview: false,
    })),
    dir,
  );
  const app = await createApp(sites);
  for (const site of sites) await seedFixture(site);
  const database = await openDatabase(join(sites[0].dataDir, "tea.db"));
  try {
    assert.equal(
      createContentStore(database.sqlite).createPage(
        "Private Draft",
        "private-draft",
      ).ok,
      true,
    );
  } finally {
    database.sqlite.close();
  }
  const previous = process.env.TEA_MCP_TOKEN;
  const call = (authorization?: string, origin?: string) =>
    app.fetch(
      new Request("https://one.example.test/tea/mcp", {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          ...(authorization ? { Authorization: authorization } : {}),
          ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
  try {
    delete process.env.TEA_MCP_TOKEN;
    assert.equal((await call()).status, 404);
    process.env.TEA_MCP_TOKEN = "fixture-secret";
    assert.equal((await call()).status, 401);
    assert.equal((await call("Bearer incorrect")).status, 401);
    assert.equal(
      (await call("Bearer fixture-secret", "https://attacker.example")).status,
      403,
    );
    const options = {
      fetch: (input: string | URL | Request, init?: RequestInit) =>
        app.fetch(new Request(input, init)),
      requestInit: { headers: { Authorization: "Bearer fixture-secret" } },
    };
    const legacy = new LegacyClient({
      name: "executor-interop",
      version: "1.0.0",
    });
    const modern = new Client(
      { name: "modern-interop", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    const endpoint = new URL("https://one.example.test/tea/mcp");
    const clients = [
      {
        client: legacy,
        connect: () => legacy.connect(new LegacyTransport(endpoint, options)),
      },
      {
        client: modern,
        connect: () =>
          modern.connect(new StreamableHTTPClientTransport(endpoint, options)),
      },
    ];
    for (const { client, connect } of clients) {
      try {
        await connect();
        assert.equal(client.getServerVersion()?.name, "teacms");
        assert.deepEqual(
          (await client.listTools()).tools.map((tool) => tool.name),
          ["list_published_pages", "get_published_page"],
        );
        const listed = await client.callTool({
          name: "list_published_pages",
          arguments: {},
        });
        assert.doesNotMatch(
          JSON.stringify(listed),
          /Private Draft|private-draft/,
        );
        const page = await client.callTool({
          name: "get_published_page",
          arguments: { slug: "example" },
        });
        assert.match(JSON.stringify(page), /Example page/);
        const draft = await client.callTool({
          name: "get_published_page",
          arguments: { slug: "private-draft" },
        });
        assert.equal(draft.isError, true);
        assert.doesNotMatch(
          JSON.stringify(draft),
          /Private Draft|private-draft/,
        );
        assert.equal(
          (
            await client.callTool({
              name: "get_published_page",
              arguments: { slug: 1 },
            })
          ).isError,
          true,
        );
        assert.equal(
          (await client.callTool({ name: "write_page", arguments: {} }))
            .isError,
          true,
        );
      } finally {
        await client.close();
      }
    }
    assert.equal(
      (
        await app.fetch(
          new Request("https://unknown.example.test/tea/mcp", {
            method: "POST",
          }),
        )
      ).status,
      404,
    );
  } finally {
    if (previous === undefined) delete process.env.TEA_MCP_TOKEN;
    else process.env.TEA_MCP_TOKEN = previous;
    app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
