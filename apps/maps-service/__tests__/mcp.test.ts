import { describe, expect, test } from "vitest";
import {
  identityFixture,
  mcpIdentityConfig,
  permissionScopes,
} from "./identity-fixture.js";
import { fixture } from "./service-fixture.js";

async function call(origin: string, method: string, args: unknown) {
  return fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: method, arguments: args },
    }),
  });
}

async function rpcBody(response: Response) {
  const text = await response.text();
  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    return JSON.parse(text);
  const data = text.split("\n").find((line) => line.startsWith("data: "));
  if (!data) throw new Error("Missing MCP response");
  return JSON.parse(data.slice(6));
}

async function setup(identity = identityFixture()) {
  const config = { ...mcpIdentityConfig };
  const app = await fixture(identity.fetch, undefined, undefined, config);
  return { app };
}

describe("Tea Maps MCP", () => {
  test("advertises central issuer and limits admin tools to local project membership", async () => {
    const { app } = await setup();
    const admin = app.database.upsertUser({
      authSubject: "central-admin",
      username: "admin",
      displayName: "Admin",
      isAdmin: true,
    });
    const metadata = await fetch(
      `${app.origin}/.well-known/oauth-protected-resource/mcp`,
    );
    const document = await metadata.json();
    expect(document.resource).toBe(`${app.origin}/mcp`);
    expect(document.authorization_servers).toEqual(["https://auth.test"]);
    expect(document.scopes_supported).toContain(
      "urn:zitadel:iam:org:project:role:admin",
    );
    const unauthenticated = await fetch(`${app.origin}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("www-authenticate")).toContain(
      "resource_metadata=",
    );

    const initialized = await fetch(`${app.origin}/mcp`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "fixture", version: "1" },
        },
      }),
    });
    expect((await rpcBody(initialized)).result.serverInfo.name).toBe(
      "tea-maps",
    );
    const created = await call(app.origin, "tea_maps_create_project", {
      name: "MCP map",
      game: "quake",
    });
    expect(created.status).toBe(200);
    const project = (await rpcBody(created)).result.structuredContent.project;
    expect(project.name).toBe("MCP map");
    expect(app.database.role(project.id, admin.id)).toBe("owner");
    const mapResponse = await call(app.origin, "tea_maps_create_map", {
      projectId: project.id,
      name: "test.map",
      format: "quake",
    });
    expect((await rpcBody(mapResponse)).result.structuredContent.map.name).toBe(
      "test.map",
    );
    const grantResponse = await call(
      app.origin,
      "tea_maps_create_browser_grant",
      {
        projectId: project.id,
      },
    );
    expect(
      (await rpcBody(grantResponse)).result.structuredContent.projectUrl,
    ).toBe(`${app.origin}/projects/${project.id}`);
    const outsider = app.database.upsertUser({
      authSubject: "outsider",
      username: "outsider",
      displayName: "Outsider",
      isAdmin: false,
    });
    const other = app.database.createProject(outsider.id, "Private", "quake");
    const denied = await call(app.origin, "tea_maps_get_project", {
      projectId: other.id,
    });
    expect((await rpcBody(denied)).result.isError).toBe(true);
  });

  test("rejects unknown, non-admin, service, and underscoped central principals", async () => {
    const scenarios = [
      { identity: identityFixture(), localAdmin: false },
      { identity: identityFixture({ roles: ["member"] }), localAdmin: true },
      {
        identity: identityFixture({ principalType: "service" }),
        localAdmin: true,
      },
      {
        identity: identityFixture({ scopes: permissionScopes("member") }),
        localAdmin: true,
      },
      {
        identity: identityFixture({ audience: "another-project" }),
        localAdmin: true,
      },
    ];
    for (const { identity, localAdmin } of scenarios) {
      const { app } = await setup(identity);
      if (localAdmin)
        app.database.upsertUser({
          authSubject: "central-admin",
          username: "admin",
          displayName: "Admin",
          isAdmin: true,
        });
      const response = await call(app.origin, "tea_maps_list_projects", {});
      expect([401, 403]).toContain(response.status);
    }
  });
});
