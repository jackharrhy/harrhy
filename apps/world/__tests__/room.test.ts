import { expect, test } from "bun:test";
import { makeBsp } from "../../../packages/maps-renderer/__tests__/fixtures";
import { loadBspCollision } from "../shared/bsp-collision";
import { createMotion } from "../shared/motion";
import {
  parseInput,
  TICK_HZ,
  validateInput,
  type InputCommand,
} from "../shared/protocol";
import { createRoom } from "../shared/room";

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
    expect(validateInput(value)).toBeNull();
  }
  expect(parseInput("{")).toBeNull();
  expect(
    parseInput(JSON.stringify({ ...command(1, { yaw: 3 * Math.PI }), x: 100 })),
  ).toEqual(command(1, { yaw: Math.PI }));
});

test("room accepts only newer inputs, advances once per tick, and isolates players", async () => {
  const room = await createRoom();
  try {
    const initial = room.join("a");
    const other = room.join("b");
    expect(room.join("a")).toEqual(initial);
    expect(other.x).not.toBe(initial.x);
    expect(room.input("missing", command(1))).toBe(false);
    expect(room.input("a", command(1, { forward: -1 }))).toBe(true);
    expect(room.input("a", command(2, { forward: 1, pitch: 0.25 }))).toBe(true);
    expect(room.input("a", command(1))).toBe(false);
    expect(room.snapshot().players[0]).toEqual(initial);
    room.step();
    const moved = room.snapshot().players.find(({ id }) => id === "a")!;
    expect(moved).toMatchObject({ ack: 1, pitch: 0 });
    expect(moved.z).toBeGreaterThan(initial.z);
    expect(room.input("a", command(2))).toBe(false);
    room.step();
    const snapshot = room.snapshot();
    expect(snapshot.tick).toBe(2);
    expect(snapshot.players.find(({ id }) => id === "a")).toMatchObject({
      ack: 2,
      pitch: 0.25,
    });
    expect(snapshot.players.find(({ id }) => id === "b")).toMatchObject({
      x: other.x,
      z: other.z,
      ack: 0,
    });
    expect(room.leave("a")).toBe(true);
    expect(room.leave("a")).toBe(false);
    expect(room.input("a", command(3))).toBe(false);
    expect(room.join("c").ack).toBe(0);
    expect(
      room
        .snapshot()
        .players.map(({ id }) => id)
        .toSorted(),
    ).toEqual(["b", "c"]);
  } finally {
    room.dispose();
  }
});

test("Authority and predictor agree on yaw-relative motion, jump, landing and wall collision", async () => {
  const room = await createRoom();
  const initial = room.join("a");
  const predictor = await createMotion(initial);
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
      expect(predicted.x).toBeCloseTo(pose.x, 10);
      expect(predicted.y).toBeCloseTo(pose.y, 10);
      expect(predicted.z).toBeCloseTo(pose.z, 10);
      expect(predicted.grounded).toBe(pose.grounded);
      peak = Math.max(peak, pose.y);
      if (seq === 18) {
        correction = JSON.parse(JSON.stringify(pose));
        expect(correction.verticalVelocity).toBeGreaterThan(0);
      }
      if (seq >= 18 && seq <= 30) replay.push(cmd);
      if (seq === 30) {
        const reconciled = predictor.reconcile(correction, replay);
        expect(reconciled.x).toBeCloseTo(pose.x, 10);
        expect(reconciled.y).toBeCloseTo(pose.y, 10);
        expect(reconciled.velocityX).toBeCloseTo(pose.velocityX, 10);
        expect(reconciled.ack).toBe(pose.ack);
        expect(pose.x).toBeLessThan(initial.x - 1);
        expect(pose.z).toBeCloseTo(initial.z);
      }
    }
    const final = room.snapshot().players[0];
    expect(peak).toBeWithin(1, 1.5);
    expect(final.y).toBeCloseTo(0, 1);
    expect(final.x).toBeWithin(-5.3, -5.15);
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
  expect(a.revision).toMatch(/^bsp30-v1-[0-9a-f]{64}$/);
  expect((await loadBspCollision(floorBsp())).revision).toBe(a.revision);
  expect(
    (await loadBspCollision(floorBsp(30, "121 -60 48"))).revision,
  ).not.toBe(a.revision);
  for (const [bytes, message] of [
    [floorBsp(29), "BSP30"],
    [floorBsp(30, "120 -60 0"), "walkable ground"],
  ] as const) {
    const result = await loadBspCollision(bytes).catch(
      (error: unknown) => error,
    );
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain(message);
  }
});

test("BSP authority and prediction agree on hull-1 spawn, jumping and landing", async () => {
  const bytes = floorBsp();
  const room = await createRoom(await loadBspCollision(bytes));
  const initial = room.join("bsp");
  const predictor = await createMotion(initial, await loadBspCollision(bytes));
  try {
    expect(initial).toMatchObject({ x: 1, z: -2, grounded: true });
    expect(initial.y).toBeCloseTo(0, 2);
    let peak = initial.y;
    for (let seq = 1; seq <= 180; seq++) {
      // The fixture has a floor but no walls, unlike the analytic hall.
      const cmd = command(seq, { forward: 1, jump: seq === 15 });
      room.input("bsp", cmd);
      room.step();
      const pose = room.snapshot().players[0];
      expect(predictor.step(cmd)).toEqual(pose);
      peak = Math.max(peak, pose.y);
    }
    expect(peak).toBeGreaterThan(1);
    expect(predictor.pose().z).toBeLessThan(-12);
    expect(predictor.pose().grounded).toBe(true);
    expect(predictor.pose().y).toBeCloseTo(0, 2);
  } finally {
    predictor.dispose();
    room.dispose();
  }
});

async function spawnPose() {
  const room = await createRoom();
  const pose = room.join("a");
  room.dispose();
  return pose;
}

test("ground acceleration and friction, with capped wish-direction air acceleration", async () => {
  const start = await spawnPose();
  const motion = await createMotion(start);
  expect(motion.step(command(1, { forward: 1 })).velocityZ).toBeCloseTo(-0.89);
  for (let seq = 2; seq <= 20; seq++) motion.step(command(seq, { forward: 1 }));
  expect(motion.pose().velocityZ).toBeCloseTo(-5.33);
  expect(motion.step(command(21)).velocityZ).toBeGreaterThan(-5.33);
  for (let seq = 22; seq <= 60; seq++) motion.step(command(seq));
  expect(motion.pose().velocityZ).toBeCloseTo(0);

  motion.reset({ ...start, y: 2, grounded: false, velocityX: 4 });
  for (let seq = 1; seq <= 10; seq++) motion.step(command(seq, { forward: 1 }));
  expect(motion.pose().velocityZ).toBeCloseTo(-0.5);
  expect(motion.pose().velocityX).toBeCloseTo(4);
});

test("held jump preserves carried speed and re-launches on landing", async () => {
  const start = await spawnPose();
  const motion = await createMotion({ ...start, velocityZ: -10 });
  const launched = motion.step(command(1, { jump: true }));
  expect(launched.verticalVelocity).toBeGreaterThan(0);
  expect(launched.velocityZ).toBeCloseTo(-10);
  motion.reset(start);
  let hops = 0;
  let grounded = true;
  for (let seq = 1; seq <= TICK_HZ * 3; seq++) {
    const pose = motion.step(command(seq, { jump: true }));
    if (grounded && !pose.grounded && pose.verticalVelocity > 0) hops++;
    grounded = pose.grounded;
  }
  expect(hops).toBeGreaterThanOrEqual(3);
});

test("steep ramp redirects falling velocity downhill without grounding", async () => {
  const motion = await createMotion({
    ...(await spawnPose()),
    x: -4.1,
    y: 1.6,
    z: -2,
    grounded: false,
    velocityZ: 1.5,
    verticalVelocity: -4,
  });
  const start = motion.pose();
  for (let seq = 1; seq <= 12; seq++) {
    expect(motion.step(command(seq, { jump: true })).grounded).toBe(false);
  }
  const slide = motion.pose();
  expect(slide.verticalVelocity).toBeLessThan(0);
  expect(slide.velocityX).toBeGreaterThan(1);
  expect(slide.velocityZ).toBeCloseTo(1.5);
  expect(slide.x).toBeGreaterThan(start.x + 0.2);
  expect(slide.y).toBeLessThan(start.y - 0.5);
});
