import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import WebSocket from "ws";

const origin = process.env.HARRHY_WORLD_TEST_URL ?? "http://127.0.0.1:3189";
const { revision } = await (await fetch(`${origin}/healthz`)).json();
const url = new URL(
  `/room?revision=${revision}`,
  origin.replace(/^http/, "ws"),
);
function connect(token = crypto.randomUUID()) {
  const ws = new WebSocket(url, { origin });
  const client = { ws, seq: 0, sounds: [], token, tables: new Map() };
  ws.on("open", () =>
    ws.send(JSON.stringify({ type: "hello", resumeToken: token })),
  );
  ws.on("error", (error) => {
    client.error = error;
  });
  ws.on("message", (data) => {
    const m = JSON.parse(data.toString());
    if (m.type === "welcome") client.id = m.id;
    if (m.type === "motion")
      client.pose = m.players.find(({ id }) => id === client.id);
    if (m.type === "pool") client.tables.set(m.table.id, m);
    if (m.type === "pool" && m.table.id === "hall-table") {
      client.pool = m;
      if (m.sounds) client.sounds.push(...m.sounds);
    }
  });
  return client;
}
const clients = [connect(), connect()];
async function until(predicate, label, timeout = 8000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    for (const c of clients) if (c.error) throw c.error;
    if (predicate()) return;
    await wait(20);
  }
  throw Error(`Timed out: ${label}`);
}
function send(client, message) {
  client.ws.send(JSON.stringify(message));
}
try {
  await until(
    () => clients.every((c) => c.pose && c.pool),
    "both clients receive table",
  );
  const [a] = clients;
  let b = clients[1];
  const { table } = a.pool;
  for (const c of clients) {
    send(c, { type: "pool-join", tableId: table.id });
  }
  await wait(150);
  assert.deepEqual(a.pool.seats, [], "distant joins rejected");
  const timer = setInterval(() => {
    for (const c of clients) {
      const dx = table.x - c.pose.x,
        dz = table.z - c.pose.z;
      const distance = Math.hypot(dx, dz);
      send(c, {
        seq: ++c.seq,
        forward: distance > 2.5 ? 0.8 : 0,
        strafe: 0,
        yaw: Math.atan2(-dx, -dz),
        pitch: 0,
        jump: false,
      });
    }
  }, 1000 / 60);
  try {
    await until(
      () =>
        clients.every(
          (c) => Math.hypot(table.x - c.pose.x, table.z - c.pose.z) < 2.8,
        ),
      "walk to table",
    );
  } finally {
    clearInterval(timer);
  }
  send(a, { type: "pool-join", tableId: table.id });
  await until(() => a.pool.seats.length === 1, "first seat");
  send(b, { type: "pool-join", tableId: table.id });
  await until(
    () => clients.every((c) => c.pool.phase === "aiming"),
    "two seats start rack",
  );
  assert.equal(a.pool.balls.length, 16);
  const shot = {
    type: "pool-shot",
    tableId: table.id,
    yaw: Math.PI / 2,
    power: 0.55,
    turnToken: a.pool.turnToken,
  };
  send(b, shot);
  await wait(150);
  assert.equal(a.pool.phase, "aiming", "wrong turn rejected");
  assert.ok(
    clients.every((c) => !c.sounds.length),
    "rejected shot is silent",
  );
  send(a, shot);
  await until(
    () => clients.every((c) => c.pool.phase === "rolling"),
    "both observe the shot",
  );
  await until(
    () => clients.every((c) => c.pool.phase !== "rolling"),
    "shot resolves",
    15000,
  );
  for (const c of clients) {
    const cues = c.sounds.filter((sound) => sound.kind === "cue");
    assert.equal(cues.length, 1, "authoritative cue is broadcast exactly once");
    assert.equal(cues[0].ballId, 0);
    assert.ok(cues[0].speed > 0);
  }
  assert.notEqual(a.pool.turnToken, shot.turnToken);
  assert.equal(a.tables.get("moss-table").phase, "waiting");
  assert.equal(a.tables.get("moss-table").balls.length, 16);
  const oldId = b.id;
  b.ws.terminate();
  b = connect(b.token);
  clients[1] = b;
  await until(
    () => b.id === oldId && b.pool?.seats.includes(oldId),
    "reconnect preserves identity and seat",
  );
  assert.equal(a.pool.turnToken, b.pool.turnToken);
  send(b, { type: "pool-leave", tableId: table.id });
  await until(
    () => a.pool.phase === "waiting" && a.pool.seats.length === 1,
    "leave returns to waiting",
  );
  console.log(
    "Two clients walked up, joined, played an authoritative shot, and left; distant and wrong-turn commands rejected.",
  );
} finally {
  for (const client of clients) client.ws.terminate();
}
