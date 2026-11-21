import assert from "node:assert/strict";
import { test } from "node:test";
import { PoolPhysics } from "@harrhy/pool/engine";
import { createShotResult } from "@harrhy/pool";
import { createWorldShotPrediction } from "../app/pool-prediction.ts";
import { observePoolRolling } from "../app/pool-rolling.ts";
import type { PoolState } from "../shared/pool-wire.ts";

test("compares the authoritative tick, not the current render frame, then yields on divergence", (t) => {
  const server = new PoolPhysics();
  const prediction = createWorldShotPrediction();
  t.after(() => {
    server.dispose();
    prediction.cancel();
  });
  const state: PoolState = {
    type: "pool",
    sampledAt: 0,
    table: { id: "main", x: 4, y: 2, z: 1, yaw: Math.PI / 2 },
    balls: server.balls.map(({ id, x, y, z, q }) => ({
      id,
      x,
      y,
      z,
      q: [...q],
    })),
    turn: "alice",
    seats: ["alice", "bob"],
    turnToken: 3,
    phase: "aiming",
    winner: null,
    groups: [null, null],
    remaining: { solid: 7, stripe: 7 },
  };
  const command = { turnToken: 3, yaw: 0.4, power: 0.8 };
  assert.ok(prediction.start(state, command, 0));
  server.strike(command.yaw, command.power);
  const result = createShotResult();
  for (let i = 0; i < 6; i++) server.step(1 / 60, result);
  const rolling: PoolState = {
    ...state,
    phase: "rolling",
    turnToken: 4,
    sampledAt: 100,
    shotTick: 6,
    balls: server.balls.map(({ id, x, y, z, q, vx, vy, vz, stage }) => ({
      id,
      x,
      y,
      z,
      q,
      vx,
      vy,
      vz,
      stage,
    })),
  };
  const atSix = prediction.sample(100)![0];
  assert.deepEqual(atSix.q, rolling.balls[0].q);
  assert.notDeepEqual(atSix.q, state.balls[0].q);
  prediction.ingest(rolling, 200);
  const predicted = prediction.sample(200)!;
  assert.notEqual(predicted[0].z, rolling.balls[0].z);
  const samples = observePoolRolling(rolling);
  assert.equal(samples[0].key, "main:0");
  assert.ok(Math.abs(samples[0].point.x - (4 + rolling.balls[0].z)) < 1e-8);
  assert.deepEqual(observePoolRolling(state), []);
  prediction.ingest(
    {
      ...rolling,
      sampledAt: 101,
      balls: rolling.balls.map((b) => ({ ...b, x: b.x + 0.1 })),
    },
    201,
  );
  assert.equal(prediction.sample(201), null);
  assert.ok(prediction.start(state, command, 300));
  prediction.acknowledge({ tableId: "other", turnToken: 3, accepted: false });
  assert.ok(prediction.sample(320));
  prediction.acknowledge({ tableId: "main", turnToken: 3, accepted: false });
  assert.equal(prediction.sample(320), null);
});
