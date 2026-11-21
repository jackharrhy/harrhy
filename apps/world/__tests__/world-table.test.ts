import assert from "node:assert/strict";
import test from "node:test";
import { createWorldTable } from "../celld/world-table.ts";

const east = { id: "east", x: 0, y: 0, z: 0, yaw: 0 };
const west = { ...east, id: "west", houseBot: true };
const dt = 1 / 60;

test("a retained shot resumes without replaying its strike; expiry resets only its table", async (t) => {
  const house = await createWorldTable(west);
  t.after(house.dispose);
  const humans = await createWorldTable(east);
  t.after(humans.dispose);
  assert.equal(
    humans.command("bob", {
      type: "pool-join",
      tableId: "east",
      withBot: true,
    }),
    undefined,
  );
  humans.command("bob", { type: "pool-join", tableId: "east" });
  const joined = house.command("alice", { type: "pool-join", tableId: "west" });
  assert.deepEqual(joined?.seats, ["alice", "house-bot"]);
  const shot = {
    type: "pool-shot",
    tableId: "west",
    turnToken: joined!.turnToken,
    yaw: 0,
    power: 0.1,
  } as const;
  assert.equal(house.command("alice", shot)?.strike?.id, "alice");
  const first = house.tick(17, dt)!;
  // While nobody is connected the hall retains the seat and stops ticking.
  house.clearAim("alice");
  const resumed = house.snapshot();
  assert.deepEqual(resumed.balls, first.balls);
  assert.deepEqual(resumed.seats, joined!.seats);
  assert.equal(resumed.phase, "rolling");
  assert.equal(resumed.strike, undefined);
  assert.equal(house.command("alice", shot), undefined);
  const next = house.tick(5_017, dt)!;
  assert.equal(next.shotTick, first.shotTick! + 1);
  assert.equal(next.strike, undefined);
  assert.deepEqual(house.leave("alice")?.seats, []);
  assert.equal(house.tick(35_017, dt), undefined);
  assert.deepEqual(humans.snapshot().seats, ["bob"]);
});

test("the house bot waits between placement, aim and strike on the hall clock", async (t) => {
  const house = await createWorldTable(west);
  t.after(house.dispose);
  const joined = house.command("alice", {
    type: "pool-join",
    tableId: "west",
  })!;
  house.command("alice", {
    type: "pool-shot",
    tableId: "west",
    turnToken: joined.turnToken,
    yaw: 0,
    power: 0.1,
  });
  let now = 0;
  for (let i = 0; i < 1800; i++) {
    now += 1000 * dt;
    if (house.tick(now, dt)?.phase === "ball-in-hand") break;
  }
  assert.equal(house.snapshot().phase, "ball-in-hand");
  assert.equal(house.tick(now + 649, dt), undefined);
  assert.equal(house.tick(now + 650, dt)?.phase, "aiming");
  assert.equal(house.tick(now + 670, dt)?.cue?.id, "house-bot");
  assert.equal(house.tick(now + 1319, dt), undefined);
  assert.equal(house.tick(now + 1320, dt)?.strike?.id, "house-bot");
  assert.equal(house.tick(now + 1340, dt)?.strike, undefined);
});
