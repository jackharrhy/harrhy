import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { makeBsp } from "../../../packages/maps-renderer/__tests__/fixtures.ts";
import {
  loadBspCollision,
  type BspCollision,
} from "../shared/bsp-collision.ts";
import { createMotion } from "../shared/motion.ts";
import {
  parseInput,
  TICK_HZ,
  validateInput,
  type InputCommand,
} from "../shared/protocol.ts";
import { createRoom } from "../shared/room.ts";

async function authoredCollision() {
  const bytes = await readFile(new URL("../content/hall.bsp", import.meta.url));
  return loadBspCollision(Uint8Array.from(bytes).buffer);
}

function close(actual: number, expected: number, digits = 2) {
  assert.ok(
    Math.abs(actual - expected) < 0.5 * 10 ** -digits,
    `${actual} ≈ ${expected}`,
  );
}

function command(
  seq: number,
  fields: Partial<InputCommand> = {},
): InputCommand {
  return {
    seq,
    forward: 0,
    strafe: 0,
    jump: false,
    yaw: 0,
    pitch: 0,
    ...fields,
  };
}

test("validates and copies movement input", () => {
  for (const value of [
    null,
    [],
    {},
    command(0),
    command(1.5),
    command(2 ** 53),
    command(1, { forward: 2 }),
    command(1, { strafe: NaN }),
    command(1, { yaw: Infinity }),
    command(1, { pitch: Math.PI }),
    { ...command(1), jump: 1 },
  ]) {
    assert.equal(validateInput(value), null);
  }
  assert.equal(parseInput("{"), null);
  assert.deepEqual(
    parseInput(JSON.stringify({ ...command(1, { yaw: 3 * Math.PI }), x: 100 })),
    command(1, { yaw: Math.PI }),
  );
});

test("room accepts only newer inputs, advances once per tick, and isolates players", async () => {
  const room = await createRoom(await loadBspCollision(floorBsp()));
  try {
    const initial = room.join("a");
    const other = room.join("b");
    assert.deepEqual(room.join("a"), initial);
    assert.equal(other.x, initial.x);
    assert.equal(other.z, initial.z);
    assert.equal(room.input("missing", command(1)), false);
    assert.equal(room.input("a", command(1, { forward: -1 })), true);
    assert.equal(
      room.input("a", command(2, { forward: 1, pitch: 0.25 })),
      true,
    );
    assert.equal(room.input("a", command(1)), false);
    assert.deepEqual(room.snapshot().players[0], initial);
    room.step();
    const moved = room.snapshot().players.find(({ id }) => id === "a")!;
    assert.partialDeepStrictEqual(moved, { ack: 1, pitch: 0 });
    assert.ok(moved.z > initial.z);
    assert.equal(room.input("a", command(2)), false);
    room.step();
    const snapshot = room.snapshot();
    assert.equal(snapshot.tick, 2);
    assert.partialDeepStrictEqual(
      snapshot.players.find(({ id }) => id === "a"),
      {
        ack: 2,
        pitch: 0.25,
      },
    );
    assert.partialDeepStrictEqual(
      snapshot.players.find(({ id }) => id === "b"),
      {
        x: other.x,
        z: other.z,
        ack: 0,
      },
    );
    assert.equal(room.leave("a"), true);
    assert.equal(room.leave("a"), false);
    assert.equal(room.input("a", command(3)), false);
    assert.equal(room.join("c").ack, 0);
    assert.deepEqual(
      room
        .snapshot()
        .players.map(({ id }) => id)
        .toSorted(),
      ["b", "c"],
    );
  } finally {
    room.dispose();
  }
});

test("Authority and predictor agree on yaw-relative motion, jump, landing and wall collision", async () => {
  const collision = await authoredCollision();
  const room = await createRoom(collision);
  const initial = room.join("a");
  const predictor = await createMotion(initial, collision);
  try {
    let peak = 0;
    let correction = initial;
    const replay: InputCommand[] = [];
    for (let seq = 1; seq <= TICK_HZ * 3; seq++) {
      const cmd = command(seq, {
        forward: 1,
        yaw: Math.PI / 2,
        jump: seq === 15,
      });
      room.input("a", cmd);
      room.step();
      const pose = room.snapshot().players[0];
      const predicted = predictor.step(cmd);
      close(predicted.x, pose.x, 10);
      close(predicted.y, pose.y, 10);
      close(predicted.z, pose.z, 10);
      assert.equal(predicted.grounded, pose.grounded);
      peak = Math.max(peak, pose.y);
      if (seq === 18) {
        correction = JSON.parse(JSON.stringify(pose));
        assert.ok(correction.verticalVelocity > 0);
      }
      if (seq >= 18 && seq <= 30) replay.push(cmd);
      if (seq === 30) {
        const reconciled = predictor.reconcile(correction, replay);
        close(reconciled.x, pose.x, 10);
        close(reconciled.y, pose.y, 10);
        close(reconciled.velocityX, pose.velocityX, 10);
        assert.equal(reconciled.ack, pose.ack);
        assert.ok(pose.x < initial.x - 1);
        close(pose.z, initial.z);
      }
    }
    const final = room.snapshot().players[0];
    assert.ok(peak >= 1 && peak < 1.5);
    close(final.y, 0, 1);
    assert.ok(final.x > -5.4 && final.x < -5.2);
    close(final.velocityX, 0);
  } finally {
    predictor.dispose();
    room.dispose();
  }
});

function floorBsp(version: 29 | 30 = 30, origin = "120 -60 48") {
  return new Uint8Array(
    makeBsp({
      version,
      collision: true,
      entityText: `{ "classname" "worldspawn" }\n{ "classname" "info_player_start" "origin" "${origin}" }\0`,
    }),
  ).buffer;
}

test("BSP30 revision identifies loaded bytes and requires a valid standing spawn", async () => {
  const a = await loadBspCollision(floorBsp());
  assert.match(a.revision, /^bsp30-v1-[0-9a-f]{64}$/);
  assert.equal((await loadBspCollision(floorBsp())).revision, a.revision);
  assert.notEqual(
    (await loadBspCollision(floorBsp(30, "121 -60 48"))).revision,
    a.revision,
  );
  for (const [bytes, message] of [
    [floorBsp(29), "BSP30"],
    [floorBsp(30, "120 -60 0"), "walkable ground"],
  ] as const) {
    await assert.rejects(loadBspCollision(bytes), new RegExp(message));
  }
});

test("BSP authority and prediction agree on hull-1 spawn, jumping and landing", async () => {
  const bytes = floorBsp();
  const room = await createRoom(await loadBspCollision(bytes));
  const initial = room.join("bsp");
  const predictor = await createMotion(initial, await loadBspCollision(bytes));
  try {
    assert.partialDeepStrictEqual(initial, { x: 1, z: -2, grounded: true });
    close(initial.y, 0, 2);
    let peak = initial.y;
    for (let seq = 1; seq <= 180; seq++) {
      const cmd = command(seq, { forward: 1, jump: seq === 15 });
      room.input("bsp", cmd);
      room.step();
      const pose = room.snapshot().players[0];
      assert.deepEqual(predictor.step(cmd), pose);
      peak = Math.max(peak, pose.y);
    }
    assert.ok(peak > 1);
    assert.ok(predictor.pose().z < -12);
    assert.equal(predictor.pose().grounded, true);
    close(predictor.pose().y, 0, 2);
  } finally {
    predictor.dispose();
    room.dispose();
  }
});

async function spawnPose(collision: BspCollision) {
  const room = await createRoom(collision);
  const pose = room.join("a");
  room.dispose();
  return pose;
}

test("ground acceleration and friction, with capped wish-direction air acceleration", async () => {
  const collision = await loadBspCollision(floorBsp());
  const start = await spawnPose(collision);
  const motion = await createMotion(start, collision);
  close(motion.step(command(1, { forward: 1 })).velocityZ, -0.89);
  for (let seq = 2; seq <= 20; seq++) motion.step(command(seq, { forward: 1 }));
  close(motion.pose().velocityZ, -5.33);
  assert.ok(motion.step(command(21)).velocityZ > -5.33);
  for (let seq = 22; seq <= 60; seq++) motion.step(command(seq));
  close(motion.pose().velocityZ, 0);

  motion.reset({ ...start, y: 2, grounded: false, velocityX: 4 });
  for (let seq = 1; seq <= 10; seq++) motion.step(command(seq, { forward: 1 }));
  close(motion.pose().velocityZ, -0.5);
  close(motion.pose().velocityX, 4);
});

test("held jump preserves carried speed and re-launches on landing", async () => {
  const collision = await loadBspCollision(floorBsp());
  const start = await spawnPose(collision);
  const motion = await createMotion({ ...start, velocityZ: -10 }, collision);
  const launched = motion.step(command(1, { jump: true }));
  assert.ok(launched.verticalVelocity > 0);
  close(launched.velocityZ, -10);
  motion.reset(start);
  let hops = 0;
  let grounded = true;
  for (let seq = 1; seq <= TICK_HZ * 3; seq++) {
    const pose = motion.step(command(seq, { jump: true }));
    if (grounded && !pose.grounded && pose.verticalVelocity > 0) hops++;
    grounded = pose.grounded;
  }
  assert.ok(hops >= 3);
});

test("steep ramp redirects falling velocity downhill without grounding", async () => {
  const collision = await authoredCollision();
  const motion = await createMotion(
    {
      ...(await spawnPose(collision)),
      x: -4.1,
      y: 1.95,
      z: -5,
      grounded: false,
      velocityZ: 1.5,
      verticalVelocity: -4,
    },
    collision,
  );
  const start = motion.pose();
  for (let seq = 1; seq <= 12; seq++) {
    assert.equal(motion.step(command(seq, { jump: true })).grounded, false);
  }
  const slide = motion.pose();
  assert.ok(slide.verticalVelocity < 0);
  assert.ok(slide.velocityX > 1);
  close(slide.velocityZ, 1.5);
  assert.ok(slide.x > start.x + 0.1);
  assert.ok(slide.y < start.y - 0.3);
});
