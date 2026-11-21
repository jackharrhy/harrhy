import { expect, test } from "vitest";
import {
  PROJECT_ROLES_SCOPE,
  projectAudienceScope,
  roleScope,
  type TokenPrincipal,
} from "@harrhy/identity";
import { authorizeRefMcp } from "../auth.ts";
import { authorizeArchive } from "../../middleware/archive-auth.ts";
import { toolsFor, callRefTool } from "../tools.ts";
import type { AppRuntimeService } from "../../data/runtime.ts";
const project = "ref-project";
function principal(
  role = "member",
  permissions = ["boards-read"],
): TokenPrincipal {
  return {
    subject: "synthetic-human",
    clientId: "delegated-client",
    principalType: "user",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    audiences: new Set([project]),
    roles: new Set([role, ...permissions]),
    scopes: new Set([
      "openid",
      projectAudienceScope(project),
      PROJECT_ROLES_SCOPE,
      ...[role, ...permissions].map(roleScope),
    ]),
  };
}

test("human member and admin board capabilities are separate from archive grants and scopes", () => {
  for (const role of ["member", "admin"]) {
    const read = authorizeRefMcp(principal(role), project);
    expect(read).toMatchObject({ canRead: true, canWrite: false });
    const write = authorizeRefMcp(principal(role, ["boards-write"]), project);
    expect(write).toMatchObject({ canRead: false, canWrite: true });
    expect(toolsFor(read).map((t) => t.name)).toEqual([
      "export_start",
      "export_status",
      "boards_list",
      "board_get",
      "asset_get",
    ]);
    expect(toolsFor(write)).toHaveLength(8);
    expect(
      toolsFor(
        authorizeRefMcp(
          principal(role, ["boards-read", "boards-write"]),
          project,
        ),
      ),
    ).toHaveLength(13);
  }
  const owner = principal("admin", ["boards-read"]);
  const ownerWithArchiveGrants = {
    ...owner,
    roles: new Set([...owner.roles, "archive-read", "archive-restore"]),
  };
  expect(() => authorizeRefMcp(ownerWithArchiveGrants, project)).not.toThrow();
  const mixed = {
    ...ownerWithArchiveGrants,
    scopes: new Set([...owner.scopes, roleScope("archive-read")]),
  };
  expect(() => authorizeRefMcp(mixed, project)).toThrow();
  expect(() => authorizeArchive(mixed, project, "read")).toThrow();
});

test("machines, wrong audiences, ambiguous admission, missing real grants and unrelated role scopes fail closed", () => {
  const valid = principal("admin", ["boards-read", "boards-write"]);
  for (const invalid of [
    { ...valid, principalType: "service" as const },
    { ...valid, subject: "" },
    { ...valid, audiences: new Set(["another-project"]) },
    { ...valid, roles: new Set(["admin", "boards-read"]) },
    { ...valid, scopes: new Set([...valid.scopes, roleScope("member")]) },
    {
      ...valid,
      scopes: new Set([...valid.scopes, roleScope("archive-restore")]),
    },
    {
      ...valid,
      scopes: new Set([...valid.scopes, roleScope("unknown-permission")]),
    },
    {
      ...valid,
      scopes: new Set(
        [...valid.scopes].filter((s) => s !== roleScope("admin")),
      ),
    },
    principal("admin", []),
  ])
    expect(() => authorizeRefMcp(invalid, project)).toThrow();
});

test("export RPCs take the verified subject; only ready jobs expose a nonsecret download URL", async () => {
  const origin = "https://ref.test";
  const reader = authorizeRefMcp(principal(), project);
  const boards = authorizeRefMcp(principal("admin", ["boards-write"]), project);
  const calls: string[][] = [];
  const job = {
    id: "export-1",
    state: "building",
    expiresAt: 1234,
    internal: "must-not-leak",
  };
  const runtime = {
    exports: {
      start: async (subject: string) => {
        calls.push([subject]);
        return job;
      },
      status: async (subject: string, id: string) => {
        calls.push([subject, id]);
        return id === job.id ? job : null;
      },
    },
  } as unknown as AppRuntimeService;
  for (const [access, name, args] of [
    [boards, "export_start", {}],
    [boards, "export_status", { id: job.id }],
    [reader, "export_start", { subject: "other" }],
    [reader, "export_status", {}],
    [reader, "export_status", { id: 123 }],
  ] as const) {
    const result = await callRefTool(runtime, access, name, args, origin);
    expect(result).toHaveProperty("isError", true);
  }
  expect(calls).toEqual([]);
  const start = await callRefTool(runtime, reader, "export_start", {}, origin);
  expect(start).toHaveProperty("structuredContent", {
    id: job.id,
    state: "building",
    expiresAt: job.expiresAt,
  });
  for (const state of ["ready", "failed"]) {
    job.state = state;
    const status = await callRefTool(
      runtime,
      reader,
      "export_status",
      { id: job.id },
      origin,
    );
    expect(status).toHaveProperty("structuredContent", {
      id: job.id,
      state,
      expiresAt: job.expiresAt,
      ...(state === "ready"
        ? { downloadUrl: `${origin}/api/archive/exports/${job.id}/download` }
        : {}),
    });
    expect(JSON.stringify(status)).not.toContain(job.internal);
  }
  const missing = await callRefTool(
    runtime,
    reader,
    "export_status",
    { id: "missing" },
    origin,
  );
  expect(missing).toHaveProperty("isError", true);
  expect(calls).toEqual([
    [reader.subject],
    [reader.subject, job.id],
    [reader.subject, job.id],
    [reader.subject, "missing"],
  ]);
});

test("tool filtering is enforced at execution and destructive actions are explicit", async () => {
  let calls = 0;
  const runtime = {
    directory: {
      listBoards: async () => {
        calls++;
        return [];
      },
    },
  } as unknown as AppRuntimeService;
  const read = authorizeRefMcp(principal(), project);
  expect(
    await callRefTool(runtime, read, "boards_list", {}, "https://ref.test"),
  ).not.toHaveProperty("isError", true);
  expect(calls).toBe(1);
  expect(
    await callRefTool(runtime, read, "item_remove", {}, "https://ref.test"),
  ).toHaveProperty("isError", true);
  expect(calls).toBe(1);
  expect(
    await callRefTool(
      runtime,
      read,
      "boards_list",
      { unexpected: true },
      "https://ref.test",
    ),
  ).toHaveProperty("isError", true);
  expect(calls).toBe(1);
  const all = toolsFor(
    authorizeRefMcp(
      principal("admin", ["boards-read", "boards-write"]),
      project,
    ),
  );
  expect(
    all.find((t) => t.name === "item_remove")?.annotations?.destructiveHint,
  ).toBe(true);
  expect(
    all.find((t) => t.name === "link_refresh")?.annotations?.destructiveHint,
  ).toBe(true);
  expect(all.some((t) => t.name.includes("board_delete"))).toBe(false);
});
