import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authorizationForRequest } from "../src/applications.mjs";
import { createAuthorizationActions } from "../src/authorization.mjs";

const app = JSON.parse(
  readFileSync(new URL("../config/applications.json", import.meta.url)),
).find((item) => item.id === "ref");
const prefix = "urn:zitadel:iam:org:project:role:";
function request(role, permissions) {
  return {
    clientId: "synthetic-ref-mcp",
    redirectUri: "http://127.0.0.1:4445/callback",
    creationDate: new Date(
      Date.parse(app.delegatedAuthRequestNotBefore) + 1000,
    ).toISOString(),
    scope: [
      "openid",
      `urn:zitadel:iam:org:project:id:${app.projectId}:aud`,
      "urn:zitadel:iam:org:projects:roles",
      ...[role, ...permissions].map((value) => prefix + value),
    ],
  };
}

test("Ref delegation keeps board and archive permission families separate", () => {
  for (const role of ["member", "admin"]) {
    for (const permissions of [
      ["boards-read"],
      ["boards-write"],
      ["boards-read", "boards-write"],
    ]) {
      const intent = authorizationForRequest([app], request(role, permissions));
      assert.equal(intent.consent, true);
      assert.deepEqual(intent.roles, [role, ...permissions]);
    }
    for (const permissions of [
      ["boards-read", "archive-read"],
      ["boards-write", "archive-restore"],
      [],
    ]) {
      assert.throws(
        () => authorizationForRequest([app], request(role, permissions)),
        { status: 403 },
      );
    }
  }
  for (const permission of ["archive-read", "archive-restore"]) {
    assert.throws(
      () => authorizationForRequest([app], request("member", [permission])),
      { status: 403 },
    );
    assert.deepEqual(
      authorizationForRequest([app], request("admin", [permission])).roles,
      ["admin", permission],
    );
  }
  for (const role of ["member", "admin"]) {
    for (const permissions of [
      ["boards-read", "unknown"],
      ["boards-write", "boards-delete"],
      ["member", "admin", "boards-read"],
    ]) {
      assert.throws(
        () => authorizationForRequest([app], request(role, permissions)),
        { status: 403 },
      );
    }
  }
  const ambiguous = {
    ...app,
    delegatedPermissionPolicies: [
      ...app.delegatedPermissionPolicies,
      app.delegatedPermissionPolicies[1],
    ],
  };
  assert.throws(
    () =>
      authorizationForRequest([ambiguous], request("member", ["boards-read"])),
    { status: 403 },
  );
});

test("Ref board consent requires every real operation grant, not just requested scope text", async () => {
  const current = request("member", ["boards-read", "boards-write"]);
  let roles = ["member", "boards-read"];
  let state = "USER_GRANT_STATE_ACTIVE";
  let userId = "person";
  let approvals = 0;
  const actions = createAuthorizationActions({
    applications: [app],
    api: async (_path, options) => {
      if (!options) return { authRequest: current };
      approvals++;
      return { callbackUrl: current.redirectUri + "?code=synthetic" };
    },
    grants: async () => [{ userId, state, roleKeys: roles }],
  });
  await assert.rejects(actions.view("missing-write", { userId: "person" }), {
    status: 403,
  });
  roles = ["member", "boards-write"];
  await assert.rejects(actions.view("missing-read", { userId: "person" }), {
    status: 403,
  });
  roles = ["member", "boards-read", "boards-write"];
  const session = { userId: "person" };
  for (const invalidRoles of [
    ["boards-read", "boards-write"],
    ["admin", "boards-read", "boards-write"],
  ]) {
    roles = invalidRoles;
    await assert.rejects(actions.view("wrong-membership", session), {
      status: 403,
    });
  }
  roles = ["member", "boards-read", "boards-write"];
  state = "USER_GRANT_STATE_INACTIVE";
  await assert.rejects(actions.view("inactive", session), { status: 403 });
  state = "USER_GRANT_STATE_ACTIVE";
  userId = "other";
  await assert.rejects(actions.view("other", session), { status: 403 });
  userId = "person";
  await assert.rejects(actions.complete("allowed", session, "approve"), {
    status: 400,
  });
  const intent = await actions.view("allowed", session);
  assert.equal(intent.consent, true);
  assert.deepEqual(intent.roles, roles);
  await assert.rejects(actions.complete("allowed", session, "approve", true), {
    status: 400,
  });
  roles = ["member", "boards-read"];
  await assert.rejects(actions.complete("allowed", session, "approve"), {
    status: 403,
  });
  assert.equal(approvals, 0);
  roles = ["member", "boards-read", "boards-write"];
  await actions.complete("allowed", session, "approve");
  assert.equal(approvals, 1);
});
