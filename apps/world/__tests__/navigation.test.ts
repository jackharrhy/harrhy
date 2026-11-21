import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadBspCollision } from "../shared/bsp-collision.ts";
import { createMotion } from "../shared/motion.ts";
import { createWorldNavigation, type NavPoint } from "../shared/navigation.ts";

const bytes = await readFile(new URL("../content/hall.bsp", import.meta.url));
const collision = await loadBspCollision(Uint8Array.from(bytes).buffer);
const { findPath } = createWorldNavigation(collision);

// Independently check every returned flat-floor leg against the authored hull.
const centre = (p: NavPoint): [number, number, number] => [
  -60 * p.z,
  -60 * p.x,
  (p.y + collision.halfHeight + 0.001) * 60,
];
for (const table of collision.tables) {
  test(`walks around ${table.id} instead of cutting through its cabinet`, () => {
    const from = { x: table.x - 1.45, y: 0, z: table.z };
    const to = { ...from, x: table.x + 1.45 };
    const route = findPath(from, to);
    assert.ok(route && route.length >= 2);
    assert.equal(route.at(-1)?.x, to.x);
    assert.equal(route.at(-1)?.z, to.z);
    let prev = from;
    for (const p of route) {
      const hit = collision.sweep(centre(prev), centre(p));
      assert.ok(!hit.startSolid && !hit.allSolid && hit.fraction === 1);
      prev = p;
    }
  });
}

test("player can follow the route around the BSP stools and bar without jumping", async () => {
  const goal = { x: 5.25, y: 0, z: 6.4 };
  const route = findPath(collision.spawn, goal);
  assert.ok(route && route.length > 1);
  const motion = await createMotion(
    {
      ...collision.spawn,
      id: "walker",
      yaw: 0,
      pitch: 0,
      ack: 0,
      velocityX: 0,
      velocityZ: 0,
      verticalVelocity: 0,
      jumpHeld: false,
      stepCooldown: 0,
    },
    collision,
  );
  let seq = 0;
  for (const point of route) {
    for (;;) {
      const dx = point.x - motion.pose().x,
        dz = point.z - motion.pose().z;
      const d = Math.hypot(dx, dz);
      if (d < 0.14) break;
      assert.ok(++seq < 900, `stuck before ${JSON.stringify(point)}`);
      motion.step({
        seq,
        yaw: Math.atan2(-dx, -dz),
        pitch: 0,
        strafe: 0,
        jump: false,
        forward: Math.min(0.65, d * 0.75),
      });
    }
  }
  assert.ok(
    Math.hypot(goal.x - motion.pose().x, goal.z - motion.pose().z) < 0.14,
  );
});

test("accepts direct supported routes but not solid, airborne or unreachable upper goals", () => {
  const from = collision.spawn;
  assert.equal(findPath(from, { ...from, z: from.z - 1 })?.length, 1);
  assert.equal(findPath(from, collision.tables[0]), null);
  assert.equal(findPath(from, { ...from, y: 2 }), null);
  let calls = 0;
  const nav = createWorldNavigation({
    ...collision,
    sweep: (a, b) => {
      calls++;
      return collision.sweep(a, b);
    },
  });
  assert.equal(nav.findPath(from, { ...collision.tables[0], y: 0.86 }), null);
  assert.ok(calls <= 6000);
  assert.equal(nav.findPath(from, { ...from, z: Infinity }), null);
});
