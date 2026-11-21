import assert from "node:assert/strict";
import { test } from "node:test";
import { nestedTreemap, planTreemap, treemap } from "../preview/layout.mjs";

const leaf = (id, bytes) => ({ id, bytes, children: [] });
const branch = (id, child) => ({
  id,
  bytes: child.bytes,
  depth: id,
  children: [child],
});

test("nested allocated file areas sum exactly and zero-byte files have no tile", () => {
  const nested = { id: 1, bytes: 7, children: [leaf(2, 5), leaf(3, 2)] };
  const plan = planTreemap(
    { id: 0, bytes: 10, children: [nested, leaf(4, 3), leaf(5, 0)] },
    100,
    40,
  );
  const boxes = treemap(plan, 100, 40, (id) => [10, 7, 5, 2, 3, 0][id]);
  for (const [id, fraction] of [
    [0, 1],
    [1, 0.7],
    [2, 0.5],
    [3, 0.2],
    [4, 0.3],
  ]) {
    const { w, h } = boxes.get(id);
    assert.ok(Math.abs((w * h) / 4000 - fraction) < 1e-10);
  }
  assert.equal(boxes.has(5), false);
});

test("heavier discoveries do not reorder earlier siblings", () => {
  const plan = planTreemap(
    { id: 0, bytes: 20, children: [leaf(1, 9), leaf(2, 10), leaf(3, 1)] },
    100,
    40,
  );
  const before = treemap(plan, 100, 40, (id) => [10, 9, 0, 1][id]);
  const after = treemap(plan, 100, 40, (id) => [20, 9, 10, 1][id]);
  assert.equal(before.has(2), false);
  assert.ok(before.get(1).x < before.get(3).x);
  assert.ok(after.get(1).x < after.get(3).x);
});

test("active descendants receive nested boxes without exceeding the mobile tile budget", () => {
  const last = { id: 4, bytes: 100, depth: 4, children: [] };
  const third = branch(3, last),
    second = branch(2, third),
    first = branch(1, second);
  const { boxes, tiles } = nestedTreemap(
    branch(0, first),
    390,
    330,
    new Map([
      [0, first],
      [1, second],
      [2, third],
      [3, last],
    ]),
  );
  assert.equal(tiles.length, 4);
  for (let id = 2; id <= 4; id++) {
    const parent = boxes.get(id - 1),
      child = boxes.get(id);
    assert.ok(child.x >= parent.x && child.y >= parent.y);
    assert.ok(child.x + child.w <= parent.x + parent.w);
    assert.ok(child.y + child.h <= parent.y + parent.h);
  }
});
