import assert from "node:assert/strict";
import { test } from "node:test";
import { createPoolInterpolation } from "../shared/pool-interpolation.ts";
import type { PoolBall, PoolState } from "../shared/pool-wire.ts";

function ball(
  id: number,
  x: number,
  q: PoolBall["q"] = [0, 0, 0, 1],
): PoolBall {
  return { id, x, y: x * 2, z: -x, q };
}

function snapshot(
  sampledAt: number,
  balls: PoolBall[],
  state: Partial<PoolState> = {},
): PoolState {
  return {
    type: "pool",
    sampledAt,
    table: { id: "table", x: 0, y: 0, z: 0, yaw: 0 },
    balls,
    seats: ["alice", "bob"],
    groups: [null, null],
    remaining: { solid: 7, stripe: 7 },
    turn: "alice",
    turnToken: 3,
    phase: "rolling",
    winner: null,
    ...state,
  };
}

test("samples server time despite jitter and matches shortest-arc ball poses by ID", () => {
  const buffer = createPoolInterpolation();
  const before = snapshot(200, [ball(1, 0), ball(2, 10)]);
  const end = snapshot(220, [
    ball(2, 12),
    ball(1, 2, [0, -Math.SQRT1_2, 0, -Math.SQRT1_2]),
  ]);
  buffer.push(before, 1_200);
  buffer.push(end, 1_290);
  const [first, second] = buffer.sample(1_310)!;
  assert.deepEqual([first.x, first.y, first.z, second.x], [1, 2, -1, 11]);
  assert.ok(Math.abs(first.q[1] - Math.sin(Math.PI / 8)) < 1e-12);
  assert.ok(Math.abs(first.q[3] - Math.cos(Math.PI / 8)) < 1e-12);
  assert.deepEqual(before.balls[0].q, [0, 0, 0, 1]);
  assert.deepEqual(buffer.sample(2_000), end.balls, "never extrapolates");
});

test("delays pocketing through settlement but snaps on placement or rack reset", () => {
  const buffer = createPoolInterpolation();
  const rolling = snapshot(200, [ball(0, 2), ball(1, 5)]);
  const settled = snapshot(220, [ball(1, 7)], {
    phase: "ball-in-hand",
    turnToken: 4,
  });
  buffer.push(rolling, 200);
  buffer.push(settled, 220);
  assert.deepEqual(
    buffer.sample(310)?.map(({ x }) => x),
    [2, 6],
  );
  assert.deepEqual(buffer.sample(320), settled.balls);
  const placed = snapshot(321, [ball(0, 1), ball(1, 7)], {
    phase: "aiming",
    turnToken: 5,
  });
  buffer.push(placed, 321);
  assert.deepEqual(buffer.sample(321), placed.balls);
  buffer.push(snapshot(330, placed.balls, { turnToken: 6 }), 330);
  const reset = snapshot(340, [ball(0, 0)], { phase: "waiting", turnToken: 7 });
  buffer.push(reset, 340);
  assert.deepEqual(buffer.sample(340), reset.balls);
  buffer.reset();
  assert.equal(buffer.sample(350), undefined);
});
