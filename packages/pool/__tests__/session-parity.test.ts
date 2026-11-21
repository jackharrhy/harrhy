import { expect, test } from "vitest";
import { createPoolSession } from "../src/session";

test("cue and strike belong only to the active seat and table", async () => {
  const a = await createPoolSession(),
    b = await createPoolSession();
  try {
    a.join("first");
    a.join("second");
    const initial = b.snapshot();
    const token = a.snapshot().turnToken;
    expect(a.aim("second", token, 0, 1)).toBe(false);
    expect(a.aim("first", token - 1, 0, 1)).toBe(false);
    expect(a.aim("first", token, 0, 0.5)).toBe(true);
    expect(a.snapshot().cue).toEqual({ id: "first", yaw: 0, power: 0.5 });
    expect(a.rematch("first", token)).toBe(false);
    expect(a.shot("first", token, 0, 0.75)).toBe(true);
    expect(a.drainStrike()).toEqual({
      id: "first",
      turnToken: token,
      yaw: 0,
      power: 0.75,
    });
    expect(a.drainStrike()).toBeUndefined();
    expect(a.snapshot().cue).toBeUndefined();
    for (let i = 0; i < 30; i++) a.step(1 / 60);
    expect(b.snapshot()).toEqual(initial);
    expect(initial.remaining).toEqual({ solid: 7, stripe: 7 });
  } finally {
    a.dispose();
    b.dispose();
  }
});
