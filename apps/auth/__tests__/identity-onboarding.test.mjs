import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createIdentityOnboardingLedger } from "../src/identity-onboarding.mjs";

const now = Date.parse("2026-07-01T12:00:00Z");
const scope = {
  actor: "operator",
  issuer: "https://issuer.invalid",
  organizationId: "org",
};
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const ledger = createIdentityOnboardingLedger(db);
  const row = ledger.preview({
    ...scope,
    username: "new-person",
    name: "Synthetic Person",
    email: "recipient@example.invalid",
    reason: "Explicit new account request",
    now,
  });
  return { db, ledger, row };
}
const create = (ledger, row, api, overrides = {}) =>
  ledger.create({
    ...scope,
    id: row.id,
    confirmed: true,
    now,
    api,
    ...overrides,
  });
const invite = (ledger, row, api, overrides = {}) =>
  ledger.invite({
    ...scope,
    id: row.id,
    confirmed: true,
    recipient: row.body.email,
    callbackUrl: "https://auth.invalid/invitation",
    api,
    ...overrides,
  });
function issuer(row, calls) {
  return async (path, options) => {
    calls.push({ path, options });
    if (path === "/v2/users/new")
      return { id: row.body.subject, emailCode: "never-retain-this-code" };
    if (options.method === "POST") return {};
    return {
      user: {
        userId: row.body.subject,
        details: { resourceOwner: "org" },
        human: { email: { email: row.body.email } },
      },
    };
  };
}

test("new identity is reserved before provider write; creation and invitation are separate, idempotent and secret-free", async (t) => {
  const { db, ledger, row } = fixture(t);
  const calls = [];
  const api = issuer(row, calls);
  assert.equal(calls.length, 0);
  assert.notEqual(row.id, row.body.subject);
  assert.equal((await create(ledger, row, api)).state, "created");
  assert.equal((await create(ledger, row, api)).state, "created");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/v2/users/new");
  assert.equal(calls[0].options.body.userId, row.body.subject);
  assert.deepEqual(calls[0].options.body.human.email, {
    email: row.body.email,
    returnCode: {},
  });
  assert.equal(calls[0].options.body.human.password, undefined);
  assert.equal((await invite(ledger, row, api)).state, "invited");
  assert.equal((await invite(ledger, row, api)).state, "invited");
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].options.body, {
    sendCode: {
      urlTemplate:
        "https://auth.invalid/invitation?userID={{.UserID}}&code={{.Code}}&orgID={{.OrgID}}",
      applicationName: "Jack Auth",
    },
  });
  assert.equal(
    JSON.stringify(
      db.prepare("SELECT * FROM identity_onboarding").all(),
    ).includes("never-retain-this-code"),
    false,
  );
  assert.equal(ledger.recent().length, 1);
});

test("actor, explicit confirmation, freshness and issuer scope are checked before any provider mutation", async (t) => {
  const { ledger, row } = fixture(t);
  let calls = 0;
  const api = async () => {
    calls++;
  };
  for (const [overrides, status] of [
    [{ actor: "another" }, 404],
    [{ confirmed: false }, 400],
    [{ issuer: "https://another.invalid" }, 409],
    [{ organizationId: "another" }, 409],
    [{ now: now + 300001 }, 409],
    [{ now: now - 1 }, 409],
  ])
    await assert.rejects(create(ledger, row, api, overrides), { status });
  assert.equal(calls, 0);
  await assert.rejects(invite(ledger, row, api), { status: 409 });
  assert.equal(calls, 0);
});

test("ambiguous creation and restart never replay a provider write", async (t) => {
  const { db, ledger, row } = fixture(t);
  let calls = 0;
  await assert.rejects(
    create(ledger, row, async () => {
      calls++;
      throw new Error("network failure after commit");
    }),
    { status: 502 },
  );
  assert.equal(ledger.get(row.id).state, "creation-unknown");
  const reopened = createIdentityOnboardingLedger(db);
  await assert.rejects(
    create(reopened, row, async () => {
      calls++;
    }),
    { status: 409 },
  );
  assert.equal(calls, 1);
  db.prepare("UPDATE identity_onboarding SET state='creating' WHERE id=?").run(
    row.id,
  );
  assert.equal(
    createIdentityOnboardingLedger(db).get(row.id).state,
    "creation-unknown",
  );
});

test("overlapping confirmations cannot duplicate creation", async (t) => {
  const { ledger, row } = fixture(t);
  let resolve;
  const pending = create(
    ledger,
    row,
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await assert.rejects(
    create(ledger, row, async () => assert.fail("duplicate write")),
    { status: 409 },
  );
  resolve({ id: row.body.subject });
  assert.equal((await pending).state, "created");
});

test("recipient changes, insecure callback and uncertain delivery cannot silently send or resend", async (t) => {
  const { ledger, row } = fixture(t);
  const calls = [];
  await create(ledger, row, issuer(row, calls));
  await assert.rejects(
    invite(ledger, row, issuer(row, calls), {
      recipient: "someone-else@example.invalid",
    }),
    { status: 400 },
  );
  await assert.rejects(
    invite(ledger, row, issuer(row, calls), {
      callbackUrl: "http://auth.invalid/invitation",
    }),
    { status: 400 },
  );
  assert.equal(calls.length, 1);
  await assert.rejects(
    invite(ledger, row, async (_path, options) => {
      assert.notEqual(options.method, "POST");
      return {
        user: {
          userId: row.body.subject,
          details: { resourceOwner: "org" },
          human: { email: { email: "changed@example.invalid" } },
        },
      };
    }),
    { status: 502 },
  );
  assert.equal(ledger.get(row.id).state, "invitation-unknown");
  await assert.rejects(
    invite(ledger, row, async () => assert.fail("must not resend")),
    { status: 409 },
  );
});
