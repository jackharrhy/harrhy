import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  createMediaIdentityLedger,
  mediaDiscrepancies,
} from "../src/media-identities.mjs";

const now = Date.parse("2026-07-01T12:00:00Z");
const mapping = {
  service: "jellyfin",
  instance: "fixture-server",
  nativeId: "native-a",
  issuer: "https://issuer.invalid",
  subject: "subject-a",
};
const people = [
  { issuer: mapping.issuer, subject: mapping.subject, active: true },
];
const inventory = {
  service: mapping.service,
  instance: mapping.instance,
  state: "available",
  observedAt: new Date(now).toISOString(),
  accounts: [
    { nativeId: mapping.nativeId, name: "Same display name" },
    { nativeId: "native-b", name: "Same display name" },
  ],
};

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  return createMediaIdentityLedger(db);
}
const preview = (ledger, overrides = {}) =>
  ledger.preview({
    actor: "operator",
    reason: "Verified exact immutable identifiers",
    mapping,
    inventory,
    people,
    now,
    ...overrides,
  });
const confirm = (ledger, id, overrides = {}) =>
  ledger.confirm({
    id,
    actor: "operator",
    inventory,
    people,
    now,
    ...overrides,
  });

test("manual review links only an exact scoped ID, preserves native-only peers and cannot mutate grants/native accounts", (t) => {
  const ledger = fixture(t);
  const before = structuredClone(inventory);
  const operation = preview(ledger);
  assert.deepEqual(ledger.mappings(), []);
  assert.equal(confirm(ledger, operation.id).state, "complete");
  assert.equal(confirm(ledger, operation.id).state, "complete");
  assert.equal(ledger.mappings().length, 1);
  assert.deepEqual(inventory, before);
  const result = mediaDiscrepancies({
    snapshot: inventory,
    mappings: ledger.mappings(),
    people,
    now,
  });
  assert.deepEqual(
    result.rows.map((item) => item.state),
    ["linked", "native-only"],
  );
  assert.equal(
    ledger.mappings()[0].reason,
    "Verified exact immutable identifiers",
  );
  assert.throws(
    () => preview(ledger, { mapping: { ...mapping, nativeId: "native-b" } }),
    {
      status: 409,
    },
  );
});

test("actor, issuer, instance, exact ID and current active person must all survive confirmation", (t) => {
  const ledger = fixture(t);
  const operation = preview(ledger);
  assert.throws(() => confirm(ledger, operation.id, { actor: "other" }), {
    status: 404,
  });
  assert.throws(
    () =>
      confirm(ledger, operation.id, {
        people: [{ ...people[0], issuer: "https://other.invalid" }],
      }),
    { status: 409 },
  );
  assert.throws(
    () =>
      confirm(ledger, operation.id, {
        people: [{ ...people[0], active: false }],
      }),
    { status: 409 },
  );
  assert.throws(
    () =>
      confirm(ledger, operation.id, {
        inventory: { ...inventory, instance: "other" },
      }),
    { status: 409 },
  );
  assert.throws(
    () =>
      confirm(ledger, operation.id, {
        inventory: {
          ...inventory,
          accounts: [{ nativeId: "replacement", name: "Same display name" }],
        },
      }),
    { status: 409 },
  );
  assert.throws(() => confirm(ledger, operation.id, { now: now + 300001 }), {
    status: 409,
  });
  assert.throws(
    () =>
      confirm(ledger, operation.id, {
        inventory: {
          ...inventory,
          accounts: [
            { ...inventory.accounts[0], administrator: true },
            inventory.accounts[1],
          ],
        },
      }),
    { status: 409 },
  );
  assert.deepEqual(ledger.mappings(), []);
});

test("review/audit survives restart and competing reviewed links cannot silently reassign a native account", (t) => {
  const directory = mkdtempSync(`${tmpdir()}/media-ledger-`);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = `${directory}/access.sqlite`;
  let db = new DatabaseSync(filename);
  let ledger = createMediaIdentityLedger(db);
  const first = preview(ledger);
  const otherPeople = [...people, { ...people[0], subject: "subject-b" }];
  const second = preview(ledger, {
    mapping: { ...mapping, subject: "subject-b" },
    people: otherPeople,
  });
  db.close();
  db = new DatabaseSync(filename);
  t.after(() => db.close());
  ledger = createMediaIdentityLedger(db);
  assert.equal(ledger.reviews().length, 2);
  assert.equal(confirm(ledger, first.id).state, "complete");
  assert.throws(() => confirm(ledger, second.id, { people: otherPeople }), {
    status: 409,
  });
  assert.equal(ledger.mappings()[0].subject, mapping.subject);
  assert.equal(ledger.review(first.id).state, "complete");
  assert.equal(ledger.review(second.id).state, "review");
});

test("freshness/unavailability never present cached absence as authoritative", () => {
  for (const snapshot of [
    { ...inventory, state: "unavailable" },
    { ...inventory, observedAt: "bad" },
    { ...inventory, observedAt: new Date(now + 600000).toISOString() },
    inventory,
  ]) {
    const result = mediaDiscrepancies({
      snapshot,
      mappings: [mapping],
      people,
      now: now + 300001,
    });
    assert.notEqual(result.state, "available");
    assert.deepEqual(result.rows, []);
  }
  assert.throws(
    () =>
      mediaDiscrepancies({
        snapshot: {
          ...inventory,
          accounts: [inventory.accounts[0], inventory.accounts[0]],
        },
        mappings: [],
        people,
        now,
      }),
    { status: 502 },
  );
});

test("mapping does not imply another service is ready even on the same issuer/project", () => {
  const result = mediaDiscrepancies({
    snapshot: { ...inventory, service: "seerr" },
    mappings: [mapping],
    people,
    now,
  });
  assert.deepEqual(
    result.rows.map((item) => item.state),
    ["native-only", "native-only"],
  );
  const missing = mediaDiscrepancies({
    snapshot: { ...inventory, accounts: [] },
    mappings: [mapping],
    people,
    now,
  });
  assert.equal(missing.rows[0].state, "native-missing");
});
