import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createConnectedAccountLedger } from "../src/connected-accounts.mjs";
import { createMediaProvisioningLedger } from "../src/media-provisioning.ts";

const target = {
  service: "jellyfin",
  instance: "local",
  issuer: "https://auth.invalid",
  subject: "person",
};
function fixture({ uncertain = false, returnedId = "returned-exact-id" } = {}) {
  const db = new DatabaseSync(":memory:");
  const media = createConnectedAccountLedger(db);
  const person = { ...target, name: "Synthetic Person", active: true };
  let writes = 0;
  let blocked = "none";
  let policyMatches = true;
  const adapter = {
    preview: async ({ username, folderIds }) => ({
      username,
      folders: folderIds.map((id) => ({ id, name: id })),
      profile: "selected-library-playback-v1",
      nativePassword: "separate-from-auth",
      mapping: "separate-exact-id-review",
    }),
    provision: async (_review, effects) => {
      await effects.claimEffect();
      writes++;
      await effects.recordNativeId("returned-exact-id");
      if (uncertain)
        return { state: "effect-unknown", nativeId: "returned-exact-id" };
      return { state: "created", nativeId: returnedId };
    },
    inspectCreated: async (id) => {
      assert.equal(id, "returned-exact-id");
      if (!policyMatches) throw new Error("Native policy changed");
    },
  };
  const dependencies = {
    people: async () => [person],
    mappings: media.mappings,
    provisioning: () => adapter,
    recordCreated: (input) => {
      if (blocked === "before-insert") throw new Error("Local failure");
      media.recordCreated(input);
      if (blocked === "after-insert") throw new Error("Lost local commit");
    },
  };
  const ledger = () => createMediaProvisioningLedger(db, dependencies);
  const preview = (combined = true) =>
    ledger().preview({
      actor: "admin",
      reason: "Friend setup",
      target,
      username: "friend",
      folderIds: ["movies"],
      createAndLink: combined,
    });
  const confirm = (id) =>
    ledger().confirm({ id, actor: "admin", password: "never-persist-this" });
  return {
    db,
    media,
    person,
    preview,
    confirm,
    ledger,
    writes: () => writes,
    block: (value) => {
      blocked = value;
    },
    policy: (value) => {
      policyMatches = value;
    },
  };
}

test("new explicit approval creates and atomically links exact returned ID, replay creates nothing", async () => {
  const f = fixture();
  try {
    const review = await f.preview();
    assert.equal(review.body.approval.person, "Synthetic Person");
    const result = await f.confirm(review.id);
    assert.equal(result.state, "linked");
    assert.deepEqual(
      f.media
        .mappings()
        .map(({ nativeId, subject }) => ({ nativeId, subject })),
      [{ nativeId: "returned-exact-id", subject: "person" }],
    );
    assert.equal((await f.confirm(review.id)).state, "linked");
    assert.equal(f.writes(), 1);
    assert.ok(!JSON.stringify(result).includes("never-persist-this"));
  } finally {
    f.db.close();
  }
});

test("local failure survives reconstructed ledger; recovery checks current exact policy and active identity without native writes", async () => {
  const f = fixture();
  try {
    const review = await f.preview();
    f.block("after-insert");
    assert.equal((await f.confirm(review.id)).state, "link-pending");
    assert.equal(f.media.mappings().length, 0);
    f.block("none");
    f.person.active = false;
    await assert.rejects(f.confirm(review.id));
    f.person.active = true;
    f.policy(false);
    await assert.rejects(f.confirm(review.id));
    f.policy(true);
    await assert.rejects(f.ledger().confirm({ id: review.id, actor: "other" }));
    assert.equal((await f.confirm(review.id)).state, "linked");
    assert.equal(f.writes(), 1);
  } finally {
    f.db.close();
  }
});

test("legacy creation remains created and unlinked on replay", async () => {
  const f = fixture();
  try {
    const review = await f.preview(false);
    assert.equal((await f.confirm(review.id)).state, "created");
    assert.equal((await f.confirm(review.id)).state, "created");
    assert.equal(f.media.mappings().length, 0);
    assert.equal(f.writes(), 1);
  } finally {
    f.db.close();
  }
});

test("conflicting native or person link stops completion and never creates again", async () => {
  for (const conflict of [{ ...target, subject: "another" }, { ...target }]) {
    const f = fixture();
    try {
      const review = await f.preview();
      f.block("before-insert");
      await f.confirm(review.id);
      f.block("none");
      f.media.recordCreated({
        target: conflict,
        nativeId:
          conflict.subject === "another"
            ? "returned-exact-id"
            : "different-native-id",
        actor: "admin",
        reason: "Separate reviewed link",
        now: Date.now(),
      });
      await assert.rejects(f.confirm(review.id));
      assert.equal(f.ledger().get(review.id).state, "link-pending");
      assert.equal(f.writes(), 1);
      assert.equal(f.media.mappings().length, 1);
    } finally {
      f.db.close();
    }
  }
});

test("combined approval never links or replays an uncertain native effect even with a returned ID", async () => {
  const f = fixture({ uncertain: true });
  try {
    const review = await f.preview();
    assert.equal((await f.confirm(review.id)).state, "effect-unknown");
    assert.equal((await f.confirm(review.id)).state, "effect-unknown");
    assert.equal(f.media.mappings().length, 0);
    assert.equal(f.writes(), 1);
  } finally {
    f.db.close();
  }
});

test("a success ID differing from the durable returned-ID checkpoint never links", async () => {
  const f = fixture({ returnedId: "different-id" });
  try {
    const review = await f.preview();
    await assert.rejects(f.confirm(review.id));
    assert.equal(f.ledger().get(review.id).state, "effect-unknown");
    assert.equal(f.ledger().get(review.id).native_id, "returned-exact-id");
    await f.confirm(review.id);
    assert.equal(f.media.mappings().length, 0);
    assert.equal(f.writes(), 1);
  } finally {
    f.db.close();
  }
});

test("concurrent finish-link attempts commit one mapping and one linked event", async () => {
  const f = fixture();
  try {
    const review = await f.preview();
    f.block("before-insert");
    await f.confirm(review.id);
    f.block("none");
    await Promise.allSettled([f.confirm(review.id), f.confirm(review.id)]);
    assert.equal(f.ledger().get(review.id).state, "linked");
    assert.equal(f.media.mappings().length, 1);
    assert.equal(
      f
        .ledger()
        .events(review.id)
        .filter((event) => event.state === "linked").length,
      1,
    );
    assert.equal(f.writes(), 1);
  } finally {
    f.db.close();
  }
});

test("unknown persisted combined approval versions fail closed", async () => {
  const f = fixture();
  try {
    const review = await f.preview();
    review.body.approval.kind = "create-and-link-v999";
    f.db
      .prepare("UPDATE media_provisioning SET body=? WHERE id=?")
      .run(JSON.stringify(review.body), review.id);
    await assert.rejects(f.confirm(review.id));
    assert.equal(f.media.mappings().length, 0);
    assert.equal(f.writes(), 0);
  } finally {
    f.db.close();
  }
});

test("person recovery finds old unresolved receipts beyond the global history limit", async () => {
  const f = fixture();
  try {
    const review = await f.preview();
    f.block("before-insert");
    await f.confirm(review.id);
    const unrelated = {
      ...review.body,
      target: { ...target, subject: "another-person" },
    };
    for (let index = 0; index < 101; index++) {
      f.db
        .prepare(
          "INSERT INTO media_provisioning (id,actor,state,created_at,body) VALUES (?,?,?,?,?)",
        )
        .run(
          `unrelated-${index}`,
          "admin",
          "review",
          "2099-01-01T00:00:00.000Z",
          JSON.stringify(unrelated),
        );
    }
    assert.equal(
      f
        .ledger()
        .list()
        .some((row) => row.id === review.id),
      false,
    );
    const scoped = f.ledger().unfinishedForPerson(target);
    assert.deepEqual(
      scoped.map((row) => row.id),
      [review.id],
    );
    assert.deepEqual(
      f.ledger().unfinishedForPerson({ ...target, subject: "another-person" }),
      [],
    );
    f.block("none");
    assert.equal((await f.confirm(scoped[0].id)).state, "linked");
    assert.deepEqual(f.ledger().unfinishedForPerson(target), []);
    assert.equal(f.writes(), 1);
  } finally {
    f.db.close();
  }
});
