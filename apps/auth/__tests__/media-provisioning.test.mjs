import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createMediaProvisioningLedger } from "../src/media-provisioning.mjs";

const target = {
  service: "jellyfin",
  instance: "local",
  issuer: "https://issuer.invalid",
  subject: "synthetic-person",
};
function fixture({ uncertain = false } = {}) {
  const db = new DatabaseSync(":memory:");
  const accounts = [
    { issuer: target.issuer, subject: target.subject, active: true },
  ];
  const links = [];
  let writes = 0;
  const adapter = {
    preview: async ({ username, folderIds }) => ({
      username,
      folders: folderIds,
    }),
    provision: async (review, { claimEffect, recordNativeId }) => {
      await claimEffect();
      writes++;
      if (uncertain) return { state: "effect-unknown" };
      await recordNativeId("synthetic-native-id");
      return { state: "created", nativeId: "synthetic-native-id" };
    },
  };
  const ledger = createMediaProvisioningLedger(db, {
    people: async () => accounts,
    mappings: () => links,
    provisioning: () => adapter,
  });
  return {
    db,
    ledger,
    accounts,
    links,
    writes: () => writes,
    preview: (username = "new-native") =>
      ledger.preview({
        actor: "reviewer",
        reason: "Explicit synthetic provisioning",
        target,
        username,
        folderIds: ["library"],
      }),
  };
}

test("durable native ID, actor and claim survive completion; no automatic mapping or password storage", async () => {
  const { db, ledger, links, preview, writes } = fixture();
  try {
    const review = await preview();
    await assert.rejects(
      ledger.confirm({ id: review.id, actor: "other", password: "secret" }),
    );
    const result = await ledger.confirm({
      id: review.id,
      actor: "reviewer",
      password: "secret",
    });
    assert.equal(result.state, "created");
    assert.equal(result.native_id, "synthetic-native-id");
    assert.deepEqual(links, []);
    assert.ok(!JSON.stringify(result).includes("secret"));
    assert.deepEqual(
      ledger.events(review.id).map((event) => event.state),
      ["review", "effect-unknown", "native-id-recorded", "created"],
    );
    await ledger.confirm({
      id: review.id,
      actor: "reviewer",
      password: "secret",
    });
    assert.equal(writes(), 1);
  } finally {
    db.close();
  }
});

test("uncertain server-generated identity blocks all overlapping person or username claims", async () => {
  const { db, ledger, accounts, preview, writes } = fixture({
    uncertain: true,
  });
  try {
    const first = await preview();
    const second = await preview("different-name");
    assert.equal(
      (await ledger.confirm({ id: first.id, actor: "reviewer" })).state,
      "effect-unknown",
    );
    await assert.rejects(ledger.confirm({ id: second.id, actor: "reviewer" }));
    accounts.push({
      issuer: target.issuer,
      subject: "other-person",
      active: true,
    });
    const third = await ledger.preview({
      actor: "reviewer",
      reason: "Independent subject",
      target: { ...target, subject: "other-person" },
      username: "NEW-NATIVE",
      folderIds: ["library"],
    });
    await assert.rejects(ledger.confirm({ id: third.id, actor: "reviewer" }));
    assert.equal(writes(), 1);
    assert.equal(ledger.get(first.id).native_id, null);
  } finally {
    db.close();
  }
});

test("fresh active Auth identity, unlinked target and five-minute review remain prerequisites", async () => {
  const { db, ledger, accounts, links, preview, writes } = fixture();
  try {
    const review = await preview();
    accounts[0].active = false;
    await assert.rejects(ledger.confirm({ id: review.id, actor: "reviewer" }));
    accounts[0].active = true;
    links.push(target);
    await assert.rejects(ledger.confirm({ id: review.id, actor: "reviewer" }));
    links.pop();
    await assert.rejects(
      ledger.confirm({
        id: review.id,
        actor: "reviewer",
        now: Date.parse(review.created_at) + 300001,
      }),
    );
    await assert.rejects(
      ledger.preview({
        actor: "reviewer",
        reason: "No implicit identity",
        target: { ...target, subject: "unknown" },
        username: "new",
        folderIds: [],
      }),
    );
    assert.equal(writes(), 0);
  } finally {
    db.close();
  }
});
