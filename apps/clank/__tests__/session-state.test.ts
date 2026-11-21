import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionStore } from "../app/session-store.ts";
import {
  apply,
  diff,
  parseCommand,
  project,
  type Row,
} from "../app/session-state.ts";

const row: Row = {
  id: "b39282b2-0938-4c7d-961a-a8a92dc85370",
  title: "Example",
  env: null,
  cwd: "/fixture",
  model: { provider: "faux", modelId: "faux-1" },
  thinkingLevel: "off",
  main: 1,
  branches: [{ conversation: 1, label: null }],
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
};

test("the wire model only contains declared session, model and branch fields", () => {
  const withExtras = {
    ...row,
    titleEdited: true,
    model: { ...row.model, configuration: "private" },
    branches: [{ ...row.branches[0]!, transcript: "private" }],
  };
  assert.deepEqual(project([withExtras]), [row]);
  assert.throws(() => project(Array.from({ length: 257 }, () => ({ ...row }))));
  assert.throws(() => project([{ ...row, cwd: "x".repeat(200 * 1024) }]));
});

test("apply changed and removed rows, reject gaps, duplicates and old epochs", () => {
  const removed = { ...row, id: "other" };
  const view = apply(undefined, {
    kind: "snapshot",
    epoch: "one",
    seq: 0,
    rows: [row, removed],
  });
  const renamed = { ...row, title: "Changed" };
  const change = {
    kind: "change" as const,
    epoch: "one",
    seq: 1,
    ...diff([row, removed], [renamed]),
  };
  assert.deepEqual(change.remove, ["other"]);
  assert.deepEqual(Object.values(apply(view, change).byId), [renamed]);
  for (const invalid of [
    { ...change, seq: 0 },
    { ...change, seq: 2 },
    { ...change, epoch: "old" },
  ])
    assert.throws(() => apply(view, invalid));
  assert.deepEqual(diff([row], [{ ...row }]), { put: [], remove: [] });
});

test("fixture commands cannot select a model, cwd, principal or arbitrary Chord method", () => {
  assert.deepEqual(
    parseCommand({ kind: "create", title: " New ", cwd: "/elsewhere" }),
    {
      kind: "create",
      title: "New",
    },
  );
  for (const v of [
    { kind: "rename", id: row.id, title: " " },
    { kind: "archive", id: "*" },
    { kind: "restore", id: row.id },
  ])
    assert.throws(() => parseCommand(v));
});

test("a local title selection notifies on change, awaits the render, and stops on abort", async () => {
  const store = createSessionStore(),
    owner = new AbortController();
  const title = store.select((state) => state.byId[row.id]?.title);
  const other = { ...row, id: "other" };
  const first = apply(undefined, {
    kind: "snapshot",
    epoch: "a",
    seq: 0,
    rows: [row, other],
  });
  await store.publish(first);
  assert.equal(title.current, row.title);
  const rendered = Promise.withResolvers<void>();
  const updates: (string | undefined)[] = [];
  title.subscribe((value) => {
    updates.push(value);
    return rendered.promise;
  }, owner);
  const next = apply(first, {
    kind: "change",
    epoch: "a",
    seq: 1,
    put: [{ ...row, title: "changed" }],
    remove: [],
  });
  assert.equal(next.byId.other, first.byId.other);
  assert.equal(next.activeIds, first.activeIds);
  let acknowledged = false;
  const delivery = store.publish(next).then(() => {
    acknowledged = true;
  });
  await Promise.resolve();
  assert.equal(title.current, "changed");
  assert.equal(acknowledged, false);
  rendered.resolve();
  await delivery;
  await store.publish({ pending: true });
  owner.abort();
  await store.publish(first);
  assert.deepEqual(updates, ["changed"]);
  assert.equal(title.current, row.title);
});
