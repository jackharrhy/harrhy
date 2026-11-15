import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createMediaServiceActions } from "../src/media-service-actions.mjs";

const mapping = {
  service: "jellyfin",
  instance: "local",
  nativeId: "exact",
  issuer: "https://issuer.invalid",
  subject: "synthetic",
};
const review = {
  nativeId: "exact",
  before: { IsDisabled: false },
  after: { IsDisabled: true },
  sessionRevocation: "manual-required",
};
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let writes = 0;
  let observed = review;
  let outcome = "disabled";
  const ledger = createMediaServiceActions(db, {
    mappings: () => [mapping],
    lifecycle: () => ({
      inspect: async () => structuredClone(observed),
      disable: async (_, claim) => {
        await claim();
        writes++;
        return { state: outcome };
      },
    }),
  });
  return {
    db,
    ledger,
    writes: () => writes,
    observe: (value) => {
      observed = value;
    },
    outcome: (value) => {
      outcome = value;
    },
  };
}
const preview = (ledger, overrides = {}) =>
  ledger.preview({
    actor: "operator",
    reason: "Exact account reviewed",
    mapping,
    now: 1000,
    ...overrides,
  });
const confirm = (ledger, id, overrides = {}) =>
  ledger.confirm({ id, actor: "operator", now: 2000, ...overrides });

test("durable claim precedes native effect, repeat and overlapping reviews cannot replay", async (t) => {
  const f = fixture(t);
  const first = await preview(f.ledger);
  const overlapping = await preview(f.ledger);
  assert.equal((await confirm(f.ledger, first.id)).state, "disabled");
  await confirm(f.ledger, first.id);
  await assert.rejects(
    confirm(f.ledger, overlapping.id),
    /already has a claimed action/,
  );
  assert.equal(f.writes(), 1);
  assert.deepEqual(
    f.ledger.events(first.id).map((event) => event.state),
    ["review", "effect-unknown", "disabled"],
  );
});

test("uncertain effects survive ledger recreation and recover only by exact readback, never replay", async (t) => {
  const f = fixture(t);
  f.outcome("effect-unknown");
  const action = await preview(f.ledger);
  assert.equal((await confirm(f.ledger, action.id)).state, "effect-unknown");
  const restarted = createMediaServiceActions(f.db, {
    mappings: () => [mapping],
    lifecycle: () => ({
      inspect: async () => ({ ...review, before: review.after }),
    }),
  });
  await assert.rejects(
    f.ledger.recover({ id: action.id, actor: "operator" }),
    /manual investigation/,
  );
  assert.equal(
    (await restarted.recover({ id: action.id, actor: "operator" })).state,
    "recovered-disabled",
  );
  assert.equal(f.writes(), 1);
  assert.equal(
    restarted.get(action.id).body.sessionRevocation,
    "manual-required",
  );
});

test("unmapped, unsupported, expired and different-actor requests cannot mutate", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    preview(f.ledger, { mapping: { ...mapping, subject: "other" } }),
    /confirmed exact-ID/,
  );
  const action = await preview(f.ledger);
  await assert.rejects(
    confirm(f.ledger, action.id, { actor: "other" }),
    /not found/,
  );
  await assert.rejects(
    confirm(f.ledger, action.id, { now: 400000 }),
    /expired/,
  );
  assert.equal(f.writes(), 0);
});

test("Seerr removal requires explicit impact confirmation and never replays unknown partial deletion", async (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const exact = { ...mapping, service: "seerr", nativeId: "7" };
  let writes = 0;
  const ledger = createMediaServiceActions(db, {
    mappings: () => [exact],
    lifecycle: () => ({
      inspect: async () => ({ nativeId: "7", requestCount: 3 }),
      removeAccountAndRequests: async (_, claim) => {
        await claim();
        writes++;
        return { state: "effect-unknown" };
      },
    }),
  });
  await assert.rejects(
    preview(ledger, { mapping: exact }),
    /explicit service operation/,
  );
  const row = await preview(ledger, {
    mapping: exact,
    operation: "remove-account-and-requests",
  });
  const overlapping = await preview(ledger, {
    mapping: exact,
    operation: "remove-account-and-requests",
  });
  await assert.rejects(confirm(ledger, row.id), /exact account/);
  await assert.rejects(
    confirm(ledger, row.id, {
      destructiveConfirmation: "REMOVE 7 AND 2 REQUESTS",
    }),
    /exact account/,
  );
  assert.equal(writes, 0);
  const confirmation = { destructiveConfirmation: "REMOVE 7 AND 3 REQUESTS" };
  assert.equal(
    (await confirm(ledger, row.id, confirmation)).state,
    "effect-unknown",
  );
  await confirm(ledger, row.id, confirmation);
  await assert.rejects(
    confirm(ledger, overlapping.id, confirmation),
    /already has a claimed action/,
  );
  await assert.rejects(
    ledger.recover({ id: row.id, actor: "operator" }),
    /partial/,
  );
  assert.equal(writes, 1);
  assert.deepEqual(
    ledger.events(row.id).map((event) => event.state),
    ["review", "effect-unknown"],
  );
});
