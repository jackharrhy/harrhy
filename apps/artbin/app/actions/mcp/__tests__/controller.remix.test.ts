import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as LegacyTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  activeToken,
  identityDiscovery,
  permissionScopes,
} from "../../../../__tests__/identity-fixture.ts";
import { mcpAuthorizationScopes } from "#lib/mcp-auth.server";
import * as assert from "remix/assert";
import { afterEach, beforeEach, describe, it } from "remix/test";

import { files, folders, jobs } from "#db";
import { getFilePath } from "#lib/files.server";
import { existsSync } from "node:fs";
import { clearServiceAuthCacheForTesting } from "#lib/service-auth.server";

import { routes } from "../../../routes.ts";
import { mcpOperations } from "../../../operations/catalog.ts";
import {
  adminCookie,
  createRouterHarness,
  router,
  type RouterHarness,
} from "../../../../__tests__/router-harness.ts";

let harness: RouterHarness;
const originalFetch = globalThis.fetch;
const originalIntrospectionSecret = process.env.AUTH_INTROSPECTION_SECRET;
const originalArtbinUrl = process.env.ARTBIN_URL;

beforeEach(async () => {
  harness = await createRouterHarness();
  process.env.AUTH_INTROSPECTION_SECRET = "test-secret";
  process.env.ARTBIN_URL = "http://localhost:5175";
  clearServiceAuthCacheForTesting();
  globalThis.fetch = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      if (String(input).endsWith("openid-configuration"))
        return Response.json(identityDiscovery);
      const token = new URLSearchParams(String(init?.body)).get("token");
      if (token === "admin-token") return Response.json(activeToken());
      if (token === "member-token")
        return Response.json(
          activeToken({
            subject: "central-member",
            roles: ["member"],
            scope: permissionScopes("admin"),
          }),
        );
      if (token === "wrong-client-token")
        return Response.json(activeToken({ clientId: "other-client" }));
      if (token === "wrong-scope-token")
        return Response.json(activeToken({ scope: "openid profile" }));
      if (token === "wrong-audience-token")
        return Response.json(activeToken({ aud: "other-project" }));
      return Response.json({ active: false });
    },
    { preconnect: originalFetch.preconnect },
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("AUTH_INTROSPECTION_SECRET", originalIntrospectionSecret);
  restoreEnv("ARTBIN_URL", originalArtbinUrl);
  clearServiceAuthCacheForTesting();
  harness.close();
});

describe("administrator MCP", () => {
  it("publishes protected-resource metadata without exposing tools publicly", async () => {
    const metadata = await router.fetch(
      harness.request(routes.mcp.protectedResource.href()),
    );
    assert.equal(metadata.status, 200);
    assert.deepEqual(await metadata.json(), {
      resource: "http://localhost:5175/mcp",
      authorization_servers: ["https://auth.test"],
      bearer_methods_supported: ["header"],
      scopes_supported: mcpAuthorizationScopes(),
    });

    const unauthorized = await mcpCall("invalid-token", "tools/list");
    assert.equal(unauthorized.status, 401);
    assert.match(
      unauthorized.headers.get("www-authenticate") ?? "",
      /oauth-protected-resource/,
    );
  });

  it("initializes and lists the bounded operation catalog", async () => {
    const initialized = await mcpCall("admin-token", "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "artbin-test", version: "1.0.0" },
    });
    assert.equal(initialized.status, 200);
    const initializeBody = await readRpcResponse(initialized);
    assert.equal(initializeBody.result.serverInfo.name, "artbin");
    assert.equal(initializeBody.result.protocolVersion, "2025-11-25");

    const listed = await mcpCall("admin-token", "tools/list");
    const names = (await readRpcResponse(listed)).result.tools.map(
      (tool: any) => tool.name,
    );
    assert.deepEqual(names, [
      "artbin_folders_list",
      "artbin_folder_delete",
      "artbin_assets_list",
      "artbin_asset_upload",
      "artbin_asset_delete",
      "artbin_asset_move",
      "artbin_folders_create",
      "artbin_folder_manage",
      "artbin_jobs_list",
      "artbin_job_manage",
      "artbin_preview_regenerate",
      "artbin_import_queue",
    ]);
    const tools = (
      await mcpCall("admin-token", "tools/list").then(readRpcResponse)
    ).result.tools;
    assert.ok(tools.every((tool: any) => tool.outputSchema?.type === "object"));
    assert.equal(
      tools.find((tool: any) => tool.name === "artbin_job_manage").annotations
        .destructiveHint,
      true,
    );

    const getResponse = await router.fetch(
      harness.request(routes.mcp.endpointGet.href(), undefined, {
        headers: { Authorization: "Bearer admin-token" },
      }),
    );
    assert.equal(getResponse.status, 405);
    assert.equal(getResponse.headers.get("allow"), "POST");
  });

  it("serves discovery, the catalog and a bounded read to the current native client", async () => {
    const client = new Client(
      { name: "native-interop", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    const requests: Headers[] = [];
    const transport = new StreamableHTTPClientTransport(
      new URL("http://artbin.test/mcp"),
      {
        fetch: (input, init) => {
          const request = new Request(input, init);
          requests.push(request.headers);
          return router.fetch(request);
        },
        requestInit: { headers: { Authorization: "Bearer admin-token" } },
      },
    );
    try {
      await client.connect(transport);
      const catalog = await client.listTools();
      assert.equal(catalog.tools.length, 12);
      const result = await client.callTool({
        name: "artbin_assets_list",
        arguments: { limit: 2 },
      });
      assert.equal(result.isError, undefined);
      assert.deepEqual(result.structuredContent, { assets: [] });
      for (const method of ["server/discover", "tools/call"]) {
        assert.ok(
          requests.some(
            (headers) =>
              headers.get("Mcp-Method") === method &&
              headers.get("MCP-Protocol-Version") === "2026-07-28",
          ),
        );
      }
    } finally {
      await client.close();
    }
  });

  it("serves the complete catalog and a bounded read to Executor's SDK 1.32.1", async () => {
    const client = new LegacyClient({
      name: "executor-interop",
      version: "1.0.0",
    });
    const transport = new LegacyTransport(new URL("http://artbin.test/mcp"), {
      fetch: (input, init) => router.fetch(new Request(input, init)),
      requestInit: { headers: { Authorization: "Bearer admin-token" } },
    });
    try {
      await client.connect(transport);
      assert.equal(client.getServerVersion()?.name, "artbin");
      const catalog = await client.listTools();
      assert.equal(catalog.tools.length, 12);
      const result = await client.callTool({
        name: "artbin_folders_list",
        arguments: { limit: 2, includeSystem: false },
      });
      assert.equal(result.isError, undefined);
      assert.deepEqual(result.structuredContent, { folders: [] });
      const rejected = await client.callTool({
        name: "artbin_folder_manage",
        arguments: {
          operation: "rename",
          slug: "missing",
          name: "Missing",
          execution: { mode: "apply" },
        },
      });
      assert.equal(rejected.isError, true);
      assert.deepEqual(rejected.content, [
        { type: "text", text: "Operation input is invalid" },
      ]);
      assert.deepEqual(await harness.database.db.select().from(folders), []);
    } finally {
      await client.close();
    }
  });

  it("authorizes registered clients by user, scope, audience, and local role", async () => {
    assert.equal(
      (await mcpCall("wrong-client-token", "tools/list")).status,
      200,
    );
    assert.equal(
      (await mcpCall("wrong-scope-token", "tools/list")).status,
      403,
    );
    assert.equal(
      (await mcpCall("wrong-audience-token", "tools/list")).status,
      401,
    );
    assert.equal((await mcpCall("member-token", "tools/list")).status, 403);
  });

  it("rejects foreign origins and unsupported versions without executing mutation notifications", async () => {
    const foreignOrigin = await router.fetch(
      harness.request(routes.mcp.endpoint.href(), undefined, {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
          Origin: "https://attacker.example",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }),
    );
    assert.equal(foreignOrigin.status, 403);

    const unsupported = await router.fetch(
      harness.request(routes.mcp.endpoint.href(), undefined, {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2099-01-01",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }),
    );
    assert.equal(unsupported.status, 400, "unsupported protocol version");

    const notification = await router.fetch(
      harness.request(routes.mcp.endpoint.href(), undefined, {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "artbin_preview_regenerate",
            arguments: { target: { scope: "all" }, confirm: true },
          },
        }),
      }),
    );
    assert.equal(notification.status, 202);
    for (const payload of [
      { jsonrpc: "2.0", id: 1, method: 123 },
      [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "artbin_preview_regenerate",
            arguments: { target: { scope: "all" }, confirm: true },
          },
        },
      ],
    ]) {
      const response = await router.fetch(
        harness.request(routes.mcp.endpoint.href(), undefined, {
          method: "POST",
          headers: {
            Authorization: "Bearer admin-token",
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-11-25",
          },
          body: JSON.stringify(payload),
        }),
      );
      assert.equal(
        response.status,
        400,
        Array.isArray(payload) ? "batch" : "malformed envelope",
      );
      await response.text();
    }
    assert.equal(await harness.database.db.query.jobs.findFirst(), undefined);
  });

  it("sanitizes unexpected operation failures before the SDK sees them", async (t) => {
    t.mock.method(
      mcpOperations.get("artbin_folders_list")!,
      "execute",
      async () => {
        throw new Error("synthetic-private-detail");
      },
    );
    const response = await mcpTool("admin-token", "artbin_folders_list", {});
    assert.equal(response.result.isError, true);
    assert.deepEqual(response.result.content, [
      { type: "text", text: "Tool failed" },
    ]);
    assert.equal(
      JSON.stringify(response).includes("synthetic-private-detail"),
      false,
    );
  });

  it("returns the same folder result through CLI REST and MCP", async () => {
    await harness.database.db.insert(folders).values({
      id: "maps",
      name: "Maps",
      slug: "maps",
      fileCount: 3,
    });
    const rest = await router.fetch(
      harness.request(routes.api.cli.foldersGet.href(), adminCookie),
    );
    const mcp = await mcpTool("admin-token", "artbin_folders_list", {});
    assert.deepEqual(mcp.result.structuredContent, await rest.json());
  });

  it("paginates folders without repeating or dropping results", async () => {
    await harness.database.db.insert(folders).values([
      { id: "alpha", name: "Alpha", slug: "alpha" },
      { id: "bravo", name: "Bravo", slug: "bravo" },
      { id: "charlie", name: "Charlie", slug: "charlie" },
    ]);
    const first = await mcpTool("admin-token", "artbin_folders_list", {
      limit: 2,
    });
    assert.deepEqual(
      first.result.structuredContent.folders.map((folder: any) => folder.slug),
      ["alpha", "bravo"],
    );
    assert.equal(first.result.structuredContent.nextCursor, "bravo");
    const second = await mcpTool("admin-token", "artbin_folders_list", {
      limit: 2,
      cursor: first.result.structuredContent.nextCursor,
    });
    assert.deepEqual(
      second.result.structuredContent.folders.map((folder: any) => folder.slug),
      ["charlie"],
    );
    assert.equal(second.result.structuredContent.nextCursor, undefined);
  });

  it("creates, uploads, lists, deletes, and cleans up a temporary MCP tree", async () => {
    const probeName = `probe-${Date.now()}.png`;
    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const created = await mcpTool("admin-token", "artbin_folders_create", {
      folders: [
        { slug: "mcp-audit", name: "MCP Audit", parentSlug: null },
        { slug: "mcp-audit/assets", name: "Assets", parentSlug: "mcp-audit" },
        { slug: "mcp-audit/moved", name: "Moved", parentSlug: "mcp-audit" },
      ],
      execution: { mode: "apply", confirm: true },
    });
    assert.equal(created.result.structuredContent.created.length, 3);

    const uploaded = await mcpTool("admin-token", "artbin_asset_upload", {
      folderSlug: "mcp-audit/assets",
      fileName: probeName,
      contentBase64: image.toString("base64"),
      confirm: true,
    });
    const asset = uploaded.result.structuredContent.asset;
    assert.equal(asset.name, probeName);
    assert.equal(existsSync(getFilePath(asset.path)), true);
    assert.equal(await folderHasPreview("mcp-audit/assets"), true);
    assert.equal(await folderHasPreview("mcp-audit"), true);

    const duplicate = await mcpTool("admin-token", "artbin_asset_upload", {
      folderSlug: "mcp-audit/assets",
      fileName: probeName,
      contentBase64: image.toString("base64"),
      confirm: true,
    });
    const duplicateAsset = duplicate.result.structuredContent.asset;
    assert.notEqual(duplicateAsset.path, asset.path);

    const listed = await mcpTool("admin-token", "artbin_assets_list", {
      folderSlug: "mcp-audit/assets",
      limit: 10,
    });
    assert.deepEqual(
      listed.result.structuredContent.assets.map((item: any) => item.id),
      [asset.id, duplicateAsset.id],
    );

    const movePlan = await mcpTool("admin-token", "artbin_asset_move", {
      fileId: asset.id,
      destinationSlug: "mcp-audit/moved",
      execution: { mode: "plan" },
    });
    assert.equal(movePlan.result.structuredContent.applied, false);
    assert.equal(
      movePlan.result.structuredContent.plan.destination.path,
      `mcp-audit/moved/${probeName}`,
    );
    assert.equal(existsSync(getFilePath(asset.path)), true);

    const moved = await mcpTool("admin-token", "artbin_asset_move", {
      fileId: asset.id,
      destinationSlug: "mcp-audit/moved",
      execution: { mode: "apply", confirm: true },
    });
    assert.equal(moved.result.structuredContent.applied, true);
    assert.equal(
      moved.result.structuredContent.asset.folderSlug,
      "mcp-audit/moved",
    );
    assert.equal(existsSync(getFilePath(asset.path)), false);
    assert.equal(
      existsSync(getFilePath(moved.result.structuredContent.asset.path)),
      true,
    );
    assert.equal(await folderHasPreview("mcp-audit/assets"), true);
    assert.equal(await folderHasPreview("mcp-audit/moved"), true);
    assert.equal(
      (
        await harness.database.db.query.folders.findFirst({
          where: (table, { eq }) => eq(table.slug, "mcp-audit/assets"),
        })
      )?.fileCount,
      1,
    );
    assert.equal(
      (
        await harness.database.db.query.folders.findFirst({
          where: (table, { eq }) => eq(table.slug, "mcp-audit/moved"),
        })
      )?.fileCount,
      1,
    );

    const assetPlan = await mcpTool("admin-token", "artbin_asset_delete", {
      fileId: asset.id,
      execution: { mode: "plan" },
    });
    assert.equal(assetPlan.result.structuredContent.applied, false);
    const deletedAsset = await mcpTool("admin-token", "artbin_asset_delete", {
      fileId: asset.id,
      execution: { mode: "apply", confirm: true, confirmationName: probeName },
    });
    assert.equal(deletedAsset.result.structuredContent.applied, true);
    assert.equal(
      existsSync(getFilePath(moved.result.structuredContent.asset.path)),
      false,
    );
    assert.equal(
      await harness.database.db.query.files.findFirst({
        where: (table, { eq }) => eq(table.id, asset.id),
      }),
      undefined,
    );
    assert.equal(await folderHasPreview("mcp-audit/moved"), false);
    assert.equal(await folderHasPreview("mcp-audit"), true);

    await mcpTool("admin-token", "artbin_asset_delete", {
      fileId: duplicateAsset.id,
      execution: {
        mode: "apply",
        confirm: true,
        confirmationName: duplicateAsset.name,
      },
    });
    assert.equal(await folderHasPreview("mcp-audit/assets"), false);
    assert.equal(await folderHasPreview("mcp-audit"), false);

    const folderPlan = await mcpTool("admin-token", "artbin_folder_delete", {
      slug: "mcp-audit",
      execution: { mode: "plan" },
    });
    assert.deepEqual(folderPlan.result.structuredContent.plan.affected, {
      folders: 3,
      files: 0,
    });
    const deletedFolder = await mcpTool("admin-token", "artbin_folder_delete", {
      slug: "mcp-audit",
      execution: {
        mode: "apply",
        confirm: true,
        confirmationName: "MCP Audit",
      },
    });
    assert.deepEqual(deletedFolder.result.structuredContent.deleted, {
      folders: 3,
      files: 0,
    });
    assert.deepEqual(await harness.database.db.select().from(folders), []);
    assert.deepEqual(await harness.database.db.select().from(files), []);
  });

  it("plans then applies a folder mutation and rejects non-admin principals", async () => {
    await harness.database.db
      .insert(folders)
      .values({ id: "maps", name: "Maps", slug: "maps" });
    const plan = await mcpTool("admin-token", "artbin_folder_manage", {
      operation: "rename",
      slug: "maps",
      name: "Classic Maps",
      execution: { mode: "plan" },
    });
    assert.equal(plan.result.structuredContent.plan.to.slug, "classic-maps");
    assert.ok(
      await harness.database.db.query.folders.findFirst({
        where: (table, { eq }) => eq(table.slug, "maps"),
      }),
    );

    const applied = await mcpTool("admin-token", "artbin_folder_manage", {
      operation: "rename",
      slug: "maps",
      name: "Classic Maps",
      execution: { mode: "apply", confirm: true },
    });
    assert.equal(applied.result.isError, undefined);
    assert.ok(
      await harness.database.db.query.folders.findFirst({
        where: (table, { eq }) => eq(table.slug, "classic-maps"),
      }),
    );

    const denied = await mcpCall("member-token", "tools/list");
    assert.equal(denied.status, 403);
  });

  it("plans and applies folder moves", async () => {
    await harness.database.db.insert(folders).values([
      { id: "source", name: "Source", slug: "source" },
      { id: "destination", name: "Destination", slug: "destination" },
    ]);
    const plan = await mcpTool("admin-token", "artbin_folder_manage", {
      operation: "move",
      slug: "source",
      destinationSlug: "destination",
      execution: { mode: "plan" },
    });
    assert.equal(
      plan.result.structuredContent.plan.to.slug,
      "destination/source",
    );
    const applied = await mcpTool("admin-token", "artbin_folder_manage", {
      operation: "move",
      slug: "source",
      destinationSlug: "destination",
      execution: { mode: "apply", confirm: true },
    });
    assert.equal(applied.result.structuredContent.applied, true);
    assert.ok(
      await harness.database.db.query.folders.findFirst({
        where: (table, { eq }) => eq(table.slug, "destination/source"),
      }),
    );
  });

  it("requires explicit confirmation for destructive job operations", async () => {
    await harness.database.db.insert(jobs).values({
      id: "pending-job",
      type: "test",
      input: "{}",
      status: "pending",
    });
    const unconfirmed = await mcpTool("admin-token", "artbin_job_manage", {
      jobId: "pending-job",
      operation: "delete",
      confirm: false,
    });
    assert.equal(unconfirmed.result.isError, true);
    assert.ok(await harness.database.db.query.jobs.findFirst());

    const confirmed = await mcpTool("admin-token", "artbin_job_manage", {
      jobId: "pending-job",
      operation: "delete",
      confirm: true,
    });
    assert.equal(confirmed.result.structuredContent.deleted, true);
    assert.equal(await harness.database.db.query.jobs.findFirst(), undefined);
  });

  it("cancels and resets jobs through MCP", async () => {
    await harness.database.db.insert(jobs).values([
      { id: "cancel-job", type: "test", input: "{}", status: "pending" },
      {
        id: "reset-job",
        type: "test",
        input: "{}",
        status: "running",
        startedAt: new Date(Date.now() - 31 * 60 * 1_000),
      },
    ]);
    const cancelled = await mcpTool("admin-token", "artbin_job_manage", {
      jobId: "cancel-job",
      operation: "cancel",
      confirm: true,
    });
    assert.equal(cancelled.result.structuredContent.job.status, "cancelled");
    const reset = await mcpTool("admin-token", "artbin_job_manage", {
      jobId: "reset-job",
      operation: "reset",
      confirm: true,
    });
    assert.equal(reset.result.structuredContent.job.status, "pending");
  });

  it("queues targeted preview regeneration through the shared operation", async () => {
    await harness.database.db
      .insert(folders)
      .values({ id: "maps", name: "Maps", slug: "maps" });
    await harness.database.db.insert(files).values({
      id: "target-map",
      path: "maps/target.bsp",
      name: "target.bsp",
      mimeType: "application/x-bsp",
      size: 64,
      kind: "map",
      folderId: "maps",
      status: "approved",
    });
    const queued = await mcpTool("admin-token", "artbin_preview_regenerate", {
      target: { scope: "file", fileId: "target-map" },
      confirm: true,
    });
    assert.equal(queued.result.structuredContent.target.fileId, "target-map");
    const job = await harness.database.db.query.jobs.findFirst();
    assert.equal(job?.type, "regenerate-previews");
    assert.equal(job?.userId, "admin");
    assert.deepEqual(JSON.parse(job!.input).target, {
      scope: "file",
      fileId: "target-map",
    });

    const rejected = await mcpTool("admin-token", "artbin_preview_regenerate", {
      target: { scope: "file", fileId: "missing" },
      confirm: true,
    });
    assert.equal(rejected.result.isError, true);
  });

  it("queues every import variant through MCP", async () => {
    const requests = [
      {
        kind: "remote",
        sourceUrls: ["https://gamebanana.com/mods/93182"],
        targetFolderId: null,
      },
      {
        kind: "folder",
        sourcePath: process.cwd(),
        collectionName: "MCP Folder Probe",
      },
      { kind: "catalog", source: "texturetown" },
      { kind: "catalog", source: "texture-station" },
      { kind: "catalog", source: "sadgrl" },
      { kind: "catalog", source: "katamari" },
      { kind: "catalog", source: "early-web-graphics" },
    ];
    for (const request of requests) {
      const queued = await mcpTool("admin-token", "artbin_import_queue", {
        ...request,
        confirm: true,
      });
      assert.equal(queued.result.isError, undefined);
      assert.ok(queued.result.structuredContent.count >= 1);
    }
    assert.equal(
      (await harness.database.db.select().from(jobs)).length,
      requests.length,
    );
  });
});

async function folderHasPreview(slug: string): Promise<boolean> {
  const folder = await harness.database.db.query.folders.findFirst({
    where: (table, { eq }) => eq(table.slug, slug),
  });
  return Boolean(
    folder?.previewPath && existsSync(getFilePath(folder.previewPath)),
  );
}

async function mcpCall(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
) {
  return router.fetch(
    harness.request(routes.mcp.endpoint.href(), undefined, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function mcpTool(
  token: string,
  name: string,
  args: Record<string, unknown>,
) {
  const response = await mcpCall(token, "tools/call", {
    name,
    arguments: args,
  });
  assert.equal(response.status, 200);
  return readRpcResponse(response);
}

async function readRpcResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!response.headers.get("Content-Type")?.startsWith("text/event-stream"))
    return JSON.parse(text);
  const messages = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"));
  assert.equal(messages.length, 1);
  return JSON.parse(messages[0]!.slice(5).trim());
}
