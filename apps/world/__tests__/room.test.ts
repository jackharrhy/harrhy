import { expect, test } from "bun:test";
import { createMotion } from "../shared/motion";
import { parseInput, TICK_HZ, validateInput, type InputCommand } from "../shared/protocol";
import { createRoom } from "../shared/room";

function command(seq: number, fields: Partial<InputCommand> = {}): InputCommand {
  return { seq, forward: 0, strafe: 0, jump: false, yaw: 0, pitch: 0, ...fields };
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
  expect(parseInput(JSON.stringify({ ...command(1, { yaw: 3 * Math.PI }), x: 100 }))).toEqual(
    command(1, { yaw: Math.PI }),
  );
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
    expect(snapshot.players.find(({ id }) => id === "a")).toMatchObject({ ack: 2, pitch: 0.25 });
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
        .sort(),
    ).toEqual(["b", "c"]);
  } finally {
    room.dispose();
  }
});

test("Box3D authority and predictor agree on yaw-relative motion, jump, landing and wall collision", async () => {
  const room = await createRoom();
  const initial = room.join("a");
  const predictor = await createMotion(initial);
  try {
    let peak = 0;
    let correction = initial;
    const replay: InputCommand[] = [];
    for (let seq = 1; seq <= TICK_HZ * 3; seq++) {
      const cmd = command(seq, { forward: 1, yaw: Math.PI / 2, jump: seq >= 4 });
      room.input("a", cmd);
      room.step();
      const pose = room.snapshot().players[0];
      expect(pose).toEqual(predictor.step(cmd));
      peak = Math.max(peak, pose.y);
      if (seq === 10) {
        correction = pose;
        expect(correction.verticalVelocity).toBeGreaterThan(0);
      }
      if (seq >= 10 && seq <= 30) replay.push(cmd);
      if (seq === 30) {
        expect(predictor.reconcile(correction, replay)).toEqual(pose);
        expect(pose.x).toBeLessThan(initial.x - 2);
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
