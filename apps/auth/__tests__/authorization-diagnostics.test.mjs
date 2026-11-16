import test from "node:test";
import assert from "node:assert/strict";
import { authorizationForRequest } from "../src/applications.mjs";

const roleScope = (role) => `urn:zitadel:iam:org:project:role:${role}`;
const audience = "urn:zitadel:iam:org:project:id:synthetic-ref:aud";
const rolesScope = "urn:zitadel:iam:org:projects:roles";
function fixture() {
  return {
    applications: [
      {
        id: "ref",
        projectId: "synthetic-ref",
        clientIds: ["registered-browser"],
        delegatedRoles: ["admin", "member"],
        delegatedPermissions: ["boards-read", "boards-write", "archive-read"],
        delegatedPermissionPolicies: [
          {
            roles: ["admin", "member"],
            permissions: ["boards-read", "boards-write"],
          },
          { roles: ["admin"], permissions: ["archive-read"] },
        ],
      },
    ],
    request: {
      clientId: "private-client-sentinel",
      redirectUri:
        "https://executor.example/callback?state=private-state-sentinel",
      scope: [
        "openid",
        "profile",
        audience,
        rolesScope,
        roleScope("admin"),
        roleScope("boards-read"),
        roleScope("boards-write"),
      ],
    },
  };
}

const cases = [
  [
    "authorization_request_shape",
    ({ request }) => {
      request.scope = "private-scope-sentinel";
    },
  ],
  [
    "authorization_audience",
    ({ request }) => {
      request.scope = request.scope.filter((scope) => scope !== audience);
    },
  ],
  [
    "authorization_audience",
    ({ applications }) => {
      applications.push({ ...applications[0], clientIds: [] });
    },
  ],
  [
    "authorization_delegation_unavailable",
    ({ applications }) => {
      applications[0].delegatedRoles = [];
    },
  ],
  [
    "authorization_hold",
    ({ applications }) => {
      applications[0].authorizationHold = true;
    },
  ],
  [
    "authorization_membership_scope",
    ({ request }) => {
      request.scope.push(roleScope("member"));
    },
  ],
  [
    "authorization_membership_scope",
    ({ request }) => {
      request.scope = request.scope.filter(
        (scope) => scope !== roleScope("admin"),
      );
    },
  ],
  [
    "authorization_permission_scope",
    ({ request }) => {
      request.scope = request.scope.filter(
        (scope) => !scope.includes("boards-"),
      );
    },
  ],
  [
    "authorization_permission_family",
    ({ request }) => {
      request.scope.push(roleScope("archive-read"));
    },
  ],
  [
    "authorization_permission_family",
    ({ applications }) => {
      applications[0].delegatedPermissionPolicies.push(
        applications[0].delegatedPermissionPolicies[0],
      );
    },
  ],
  [
    "authorization_required_scope",
    ({ request }) => {
      request.scope = request.scope.filter((scope) => scope !== "openid");
    },
  ],
  [
    "authorization_required_scope",
    ({ request }) => {
      request.scope = request.scope.filter((scope) => scope !== rolesScope);
    },
  ],
  [
    "authorization_unexpected_scope",
    ({ request }) => {
      request.scope.push("private-unexpected-scope-sentinel");
    },
  ],
  [
    "authorization_callback_url",
    ({ request }) => {
      request.redirectUri = "private-invalid-callback-sentinel";
    },
  ],
  [
    "authorization_callback_policy",
    ({ request }) => {
      request.redirectUri =
        "http://external.example/callback?state=private-state-sentinel";
    },
  ],
  [
    "authorization_callback_policy",
    ({ request }) => {
      request.redirectUri =
        "https://private-user:private-password@executor.example/callback";
    },
  ],
  [
    "authorization_callback_policy",
    ({ request }) => {
      request.redirectUri += "#private-fragment";
    },
  ],
];

test("delegated denials carry only a fixed internal reason while preserving the generic response", () => {
  for (const [code, change] of cases) {
    const current = fixture();
    change(current);
    assert.throws(
      () => authorizationForRequest(current.applications, current.request),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(
          error.message,
          "This authorization request is not enabled.",
        );
        assert.equal(error.code, code);
        assert.equal(
          JSON.stringify(error),
          JSON.stringify({ status: 403, code }),
        );
        assert.doesNotMatch(error.stack, /private-/);
        return true;
      },
    );
  }
});

test("valid board delegation and registered-client behavior are unchanged", () => {
  const { applications, request } = fixture();
  const delegated = authorizationForRequest(applications, request);
  assert.equal(delegated.consent, true);
  assert.deepEqual(delegated.roles, ["admin", "boards-read", "boards-write"]);
  assert.equal(delegated.clientOrigin, "https://executor.example");
  assert.equal(
    authorizationForRequest(applications, { clientId: "registered-browser" })
      .consent,
    false,
  );
});
