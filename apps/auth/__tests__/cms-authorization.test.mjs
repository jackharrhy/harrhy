import "remix/node-tsx";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAuthorizationActions } from "../src/authorization.mjs";
import { authorizationForRequest } from "../src/applications.mjs";

const registry = JSON.parse(
  readFileSync(new URL("../config/applications.json", import.meta.url), "utf8"),
);
const cms = registry.find((app) => app.id === "cms");
const owner = "reviewed-owner";
const scopes = [
  "openid",
  `urn:zitadel:iam:org:project:id:${cms.projectId}:aud`,
  "urn:zitadel:iam:org:projects:roles",
  "urn:zitadel:iam:org:project:role:admin",
];

test("CMS source remains held with an explicit deny-all eligibility default", () => {
  assert.equal(cms.authorizationHold, true);
  assert.deepEqual(cms.allowedUserIds, []);
  for (const clientId of [...cms.clientIds, "delegated-client"])
    assert.throws(
      () =>
        authorizationForRequest([cms], {
          clientId,
          scope: scopes,
          redirectUri: "https://client.example/callback",
        }),
      { status: 403 },
    );
});

test("CMS release still requires immutable reviewed eligibility and the existing active grant for browser and delegation", async () => {
  for (const clientId of [...cms.clientIds, "delegated-client"]) {
    for (const allowedUserIds of [[], [owner], "invalid"]) {
      const application = { ...cms, authorizationHold: false, allowedUserIds };
      const writes = [];
      let roles = ["admin"];
      const request = {
        clientId,
        scope: scopes,
        redirectUri: "https://client.example/callback",
      };
      const actions = createAuthorizationActions({
        applications: [application],
        grants: async () =>
          [owner, "other-admin", "unlinked-member"].map((userId) => ({
            userId,
            state: "USER_GRANT_STATE_ACTIVE",
            roleKeys: roles,
          })),
        api: async (_path, options) => {
          if (!options) return { authRequest: request };
          writes.push(options.body);
          return { callbackUrl: request.redirectUri + "?code=fixture" };
        },
      });
      for (const userId of ["other-admin", "unlinked-member"])
        await assert.rejects(
          actions.complete("request", { userId }, "approve"),
          { status: 403 },
        );
      assert.equal(writes.length, 0);
      const session = {
        userId: owner,
        sessionId: "native-session",
        sessionToken: "native-proof",
      };
      if (!Array.isArray(allowedUserIds) || !allowedUserIds.length) {
        await assert.rejects(actions.view("request", session), { status: 403 });
        continue;
      }
      roles = [];
      await assert.rejects(actions.view("request", session), { status: 403 });
      roles = ["admin"];
      const intent = await actions.view("request", session);
      assert.equal(intent.consent, clientId === "delegated-client");
      await actions.complete("request", session, "approve");
      assert.equal(writes.length, 1);
      assert.equal(writes[0].session.sessionId, "native-session");
      application.allowedUserIds = [];
      await assert.rejects(actions.view("new-request", session), {
        status: 403,
      });
    }
  }
});
