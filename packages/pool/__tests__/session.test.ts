import { expect, test } from "vitest";
import { createPoolSession } from "../src/session";

function settle(table: Awaited<ReturnType<typeof createPoolSession>>) {
  for (let i = 0; i < 1800; i++) {
    if (table.step(1 / 60)) return;
  }
  throw new Error("The shot did not settle within 30 simulated seconds");
}

test("authenticates turns, resolves a foul, and validates cue placement", async () => {
  const table = await createPoolSession();
  try {
    expect(table.join("alice")).toBe(true);
    expect(table.join("alice")).toBe(false);
    expect(table.phase).toBe("waiting");
    expect(table.join("bob")).toBe(true);
    expect(table.join("spectator")).toBe(false);
    const { turnToken: first } = table.snapshot();
    expect(table.shot("bob", first, 0, 0.1)).toBe(false);
    expect(table.shot("alice", first - 1, 0, 0.1)).toBe(false);
    expect(table.shot("alice", first, 0, NaN)).toBe(false);
    expect(table.shot("alice", first, 0, 0.1)).toBe(true);
    expect(table.shot("alice", first, 0, 0.1)).toBe(false);
    settle(table);
    expect(table.snapshot()).toMatchObject({
      phase: "ball-in-hand",
      turn: "bob",
    });
    const { turnToken: placement } = table.snapshot();
    expect(table.place("bob", placement, 2, 2)).toBe(false);
    expect(table.place("alice", placement, 0, 0)).toBe(false);
    expect(table.place("bob", placement, 0, 0)).toBe(true);
    expect(table.snapshot()).toMatchObject({ phase: "aiming", turn: "bob" });
    expect(table.shot("bob", placement, 0, 0.1)).toBe(false);
  } finally {
    table.dispose();
  }
});

test("ball snapshots carry simulated rotation without sharing mutable physics state", async () => {
  const table = await createPoolSession();
  try {
    table.join("alice");
    table.join("bob");
    const initial = table.snapshot();
    expect(initial.balls.find(({ id }) => id === 0)?.q).toEqual([0, 0, 0, 1]);
    expect(table.shot("alice", initial.turnToken, 0, 0.5)).toBe(true);
    for (let i = 0; i < 8; i++) table.step(1 / 60);
    const q = table.snapshot().balls.find(({ id }) => id === 0)!.q;
    expect(Math.hypot(...q)).toBeCloseTo(1, 5);
    expect(Math.hypot(...q.slice(0, 3))).toBeGreaterThan(0.01);
    const rotation = [...q];
    q.fill(0);
    expect(table.snapshot().balls.find(({ id }) => id === 0)?.q).toEqual(
      rotation,
    );
  } finally {
    table.dispose();
  }
});

test("drains cue and collision sounds accumulated across physics steps once", async () => {
  const table = await createPoolSession();
  try {
    table.join("alice");
    table.join("bob");
    expect(table.drainSounds()).toEqual([]);
    expect(
      table.shot("alice", table.snapshot().turnToken, Math.PI / 2, 1),
    ).toBe(true);
    expect(table.drainSounds()).toEqual([]);
    for (let i = 0; i < 120; i++) table.step(1 / 60);
    const sounds = table.drainSounds();
    expect(sounds.filter(({ kind }) => kind === "cue")).toHaveLength(1);
    expect(sounds.some(({ kind }) => kind === "ball")).toBe(true);
    expect(table.drainSounds()).toEqual([]);
  } finally {
    table.dispose();
  }
});

test("leaving mid-shot resets the rack without replaying the interrupted turn", async () => {
  const table = await createPoolSession();
  try {
    table.join("alice");
    table.join("bob");
    const before = table.snapshot();
    expect(table.shot("alice", before.turnToken, Math.PI / 2, 0.8)).toBe(true);
    for (let i = 0; i < 10; i++) table.step(1 / 60);
    expect(table.snapshot().balls).not.toEqual(before.balls);
    expect(table.leave("bob")).toBe(true);
    expect(table.drainSounds()).toEqual([]);
    expect(table.step(1 / 60)).toBe(false);
    expect(table.snapshot()).toMatchObject({
      phase: "waiting",
      seats: ["alice"],
      balls: before.balls,
    });
    expect(table.join("charlie")).toBe(true);
    expect(table.shot("alice", before.turnToken, Math.PI / 2, 0.8)).toBe(false);
  } finally {
    table.dispose();
  }
});

test("the bot places and shoots through the same foul and rolling transitions", async () => {
  const table = await createPoolSession();
  try {
    table.join("alice");
    table.join("house-bot");
    expect(table.playBot("house-bot")).toBe(false);
    expect(table.shot("alice", table.snapshot().turnToken, 0, 0.1)).toBe(true);
    settle(table);
    expect(table.snapshot()).toMatchObject({
      phase: "ball-in-hand",
      turn: "house-bot",
    });
    expect(table.playBot("house-bot")).toBe(true);
    expect(table.snapshot()).toMatchObject({
      phase: "aiming",
      turn: "house-bot",
    });
    const placed = table.snapshot();
    expect(table.playBot("house-bot")).toBe(true);
    expect(table.playBot("house-bot")).toBe(false);
    table.step(1 / 60);
    expect(table.snapshot().balls).not.toEqual(placed.balls);
    settle(table);
  } finally {
    table.dispose();
  }
});
