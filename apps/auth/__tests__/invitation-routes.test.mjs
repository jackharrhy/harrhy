import test from "node:test";
import assert from "node:assert/strict";
import { createInvitationRoute } from "../src/invitation-routes.mjs";

function fixture() {
  const completed = [];
  const rendered = [];
  const redirects = [];
  const session = {};
  const route = createInvitationRoute({
    ledger: {
      completeInvitation: async (value) => {
        completed.push(value);
      },
    },
    issuer: "https://issuer.invalid",
    organizationId: "org",
    provisioningApi: async () => {},
    loginApi: async () => {},
    emailActions: {
      passwordPolicy: async () => ({ minLength: 12, hasNumber: true }),
    },
    rateLimit: () => {},
    renderEmailForm: (mode, context) => {
      rendered.push({ mode, context });
      return "form";
    },
    renderEmailResult: (title) => title,
  });
  const input = (method, path = "/invitation", fields = {}) => ({
    request: { method },
    url: new URL(path, "https://auth.invalid"),
    session,
    form: new URLSearchParams(fields),
    context: { csrf: "synthetic-csrf" },
    redirect: (target) => redirects.push(target),
    sendRemix: async (render) => render("nonce"),
  });
  return { route, input, completed, rendered, redirects, session };
}
const subject = "00000000-0000-4000-8000-000000000001";
const link = `/invitation?userID=${subject}&code=synthetic-proof&orgID=org`;
test("invitation GET strips proof into expiring browser memory without native effect; POST validates before consuming", async () => {
  const { route, input, completed, rendered, redirects, session } = fixture();
  await route(input("GET", link));
  assert.deepEqual(redirects, ["/invitation"]);
  assert.equal(completed.length, 0);
  assert.equal(rendered.length, 0);
  assert.equal(session.identityInvitation.code, "synthetic-proof");
  await route(input("GET"));
  assert.equal(rendered[0].mode, "invitation");
  await route(
    input("POST", "/invitation", { password: "short", confirmation: "short" }),
  );
  assert.equal(completed.length, 0);
  assert.ok(session.identityInvitation);
  await route(
    input("POST", "/invitation", {
      password: "SyntheticPassword7",
      confirmation: "mismatch",
    }),
  );
  assert.equal(completed.length, 0);
  await route(
    input("POST", "/invitation", {
      password: "SyntheticPassword7",
      confirmation: "SyntheticPassword7",
    }),
  );
  assert.equal(session.identityInvitation, undefined);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].subject, subject);
  assert.equal(completed[0].code, "synthetic-proof");
  await assert.rejects(route(input("POST")), /current invitation/);
});
test("invitation rejects wrong organization, missing binding and expiry without native completion", async () => {
  const { route, input, session, completed } = fixture();
  await assert.rejects(
    route(input("GET", link.replace("orgID=org", "orgID=other"))),
    /invalid/,
  );
  await assert.rejects(route(input("POST")), /current invitation/);
  await route(input("GET", link));
  session.identityInvitation.expires = 0;
  await assert.rejects(route(input("POST")), /current invitation/);
  assert.equal(session.identityInvitation, undefined);
  assert.equal(completed.length, 0);
});
