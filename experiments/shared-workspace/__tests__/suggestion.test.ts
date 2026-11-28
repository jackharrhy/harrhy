import assert from "node:assert/strict";
import test from "node:test";
import { boot } from "../toy.ts";

// Pure state fixture: an approved version supplies exactly one transcript input.
// No execution or workspace mutation is implied by admission.
function suggestionQueue() {
  type Version = Readonly<{ id: number; text: string }>;
  type State = { kind: "draft" | "approved" | "admitted"; version: Version };
  let current: State | undefined;
  let nextId = 0;
  const inputs: string[] = [];
  return {
    propose(text: string) {
      const version = Object.freeze({ id: ++nextId, text });
      current = { kind: "draft", version };
      return version;
    },
    approve(role: "owner" | "marty", version: Version) {
      if (role !== "owner") throw new Error("DENIED");
      if (current?.version !== version || current.kind !== "draft")
        throw new Error("STALE");
      current = { kind: "approved", version };
    },
    admit(version: Version) {
      if (current?.version !== version || current.kind !== "approved")
        throw new Error("NOT_APPROVED");
      current = { kind: "admitted", version };
      inputs.push(version.text);
    },
    inputs: () => [...inputs],
  };
}

test("only the owner can approve the exact immutable current suggestion; admit once", () => {
  const queue = suggestionQueue();
  const stale = queue.propose("old text");
  queue.approve("owner", stale);
  const current = queue.propose("approved text");
  assert.equal(Object.isFrozen(current), true);
  assert.equal(Reflect.set(current, "text", "changed"), false);
  assert.throws(() => queue.admit(stale), /NOT_APPROVED/);
  assert.throws(() => queue.approve("owner", stale), /STALE/);
  assert.throws(() => queue.approve("marty", current), /DENIED/);
  assert.throws(() => queue.admit(current), /NOT_APPROVED/);
  queue.approve("owner", current);
  assert.throws(() => queue.admit({ ...current }), /NOT_APPROVED/);
  queue.admit(current);
  assert.throws(() => queue.admit(current), /NOT_APPROVED/);
  assert.deepEqual(queue.inputs(), ["approved text"]);
});

test("local stale room stays denied after a new epoch grants access", async (t) => {
  const app = await boot(":memory:");
  t.after(() => app.close());
  const owner = app.local("home", "owner");
  const marty = app.local("home", "marty");
  const stale = marty.open();
  assert.ok(stale.read().length);
  owner.setMarty("familiar", false, false);
  assert.throws(() => stale.read(), /DENIED/);
  owner.setMarty("familiar", true, false);
  assert.throws(() => stale.read(), /DENIED/);
  assert.ok(marty.open().read().length);
});
