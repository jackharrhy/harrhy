import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// Opt-in, synthetic-only native contract check. Never reads production settings.
process.umask(0o077);
const state = new URL("../.local-real/", import.meta.url);
const receipt = new URL("invitation-contract.json", state);
if (existsSync(receipt))
  throw new Error(
    "Contract receipt exists; inspect it before another synthetic run.",
  );
const seed = JSON.parse(readFileSync(new URL("seed.json", state), "utf8"));
const organizationId = seed.steps.organization.id;
const operator = readFileSync(
  new URL("bootstrap/operator.pat", state),
  "utf8",
).trim();
const login = readFileSync(
  new URL("bootstrap/login.pat", state),
  "utf8",
).trim();
const userId = randomUUID();
const record = { userId, state: "prepared", steps: [] };
function save() {
  writeFileSync(receipt, JSON.stringify(record, null, 2) + "\n", {
    mode: 0o600,
  });
}
save();
async function api(path, body, token = operator, expected = 200) {
  const response = await fetch(new URL(path, "http://localhost:18887"), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-zitadel-orgid": organizationId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  // Do not log provider bodies: they can contain one-time codes.
  assert.equal(response.status, expected, `Native contract ${path} status`);
  return response.json();
}
async function step(name, effect) {
  record.state = `applying:${name}`;
  save();
  const value = await effect();
  record.steps.push(name);
  record.state = "pending";
  save();
  return value;
}
try {
  const created = await step("create-without-password-or-email-delivery", () =>
    api("/v2/users/new", {
      organizationId,
      userId,
      username: `invitation-${userId}`,
      human: {
        profile: { givenName: "Synthetic", familyName: "Invitation" },
        email: {
          email: `invitation-${userId}@example.invalid`,
          returnCode: {},
        },
      },
    }),
  );
  assert.equal(created.id, userId);
  const before = await step("read-exact-reserved-id", () =>
    api(`/v2/users/${userId}`),
  );
  assert.equal(before.user.userId, userId);
  assert.equal(before.user.details.resourceOwner, organizationId);
  assert.notEqual(before.user.human.email.isVerified, true);
  const invitation = await step("return-invite-without-email-delivery", () =>
    api(`/v2/users/${userId}/invite_code`, { returnCode: {} }),
  );
  assert.equal(typeof invitation.inviteCode, "string");
  const rejected = await step("reject-wrong-invitation", () =>
    api(
      `/v2/users/${userId}/invite_code/verify`,
      { verificationCode: "wrong-code" },
      login,
      400,
    ),
  );
  assert.equal(rejected.code, 3, "Native invalid-proof code changed");
  assert(
    typeof rejected.message === "string" &&
      rejected.message.endsWith("(COMMAND-Wgn4q)"),
    "Native invalid-proof identifier changed",
  );
  await step("recipient-proof-verifies-invitation", () =>
    api(
      `/v2/users/${userId}/invite_code/verify`,
      { verificationCode: invitation.inviteCode },
      login,
    ),
  );
  const verified = await step("email-verified-by-invite", () =>
    api(`/v2/users/${userId}`),
  );
  assert.equal(verified.user.human.email.isVerified, true);
  await step("reject-invitation-replay", () =>
    api(
      `/v2/users/${userId}/invite_code/verify`,
      { verificationCode: invitation.inviteCode },
      login,
      400,
    ),
  );
  const reset = await step("operator-returns-first-password-proof", () =>
    api(`/v2/users/${userId}/password_reset`, { returnCode: {} }),
  );
  assert.equal(typeof reset.verificationCode, "string");
  const password = `Synthetic-${randomBytes(24).toString("base64url")}!7a`;
  await step("reject-wrong-password-proof", () =>
    api(
      `/v2/users/${userId}/password`,
      {
        newPassword: { password, changeRequired: false },
        verificationCode: "wrong-code",
      },
      login,
      400,
    ),
  );
  await step("proof-bound-first-password", () =>
    api(
      `/v2/users/${userId}/password`,
      {
        newPassword: { password, changeRequired: false },
        verificationCode: reset.verificationCode,
      },
      login,
    ),
  );
  await step("reject-password-proof-replay", () =>
    api(
      `/v2/users/${userId}/password`,
      {
        newPassword: { password, changeRequired: false },
        verificationCode: reset.verificationCode,
      },
      login,
      400,
    ),
  );
  const signedIn = await step("native-sign-in-with-recipient-password", () =>
    api(
      "/v2/sessions",
      {
        checks: { user: { userId }, password: { password } },
        lifetime: "60s",
      },
      login,
      201,
    ),
  );
  assert.equal(typeof signedIn.sessionId, "string");
  const session = await step("native-password-factor-confirmed", () =>
    api(`/v2/sessions/${signedIn.sessionId}`, undefined, login),
  );
  assert.equal(session.session.factors.user.id, userId);
  assert.ok(session.session.factors.password.verifiedAt);
  record.state = "passed";
  save();
  console.log(
    "Synthetic native invitation contract passed; no codes or passwords retained.",
  );
} catch (error) {
  record.state = "unknown";
  save();
  throw error;
}
