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
    ).toHaveLength(11);
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
