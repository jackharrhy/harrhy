const sumSamples = (samples) =>
  samples.reduce((total, sample) => total + sample, 0);
import { get } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import WebSocket from "ws";

const rate = 60;
const setupMs = 5000;
const drainMs = 500;
const help = `Usage: node apps/world/scripts/bench-room.mjs [options]

Benchmark already-running, empty disposable World rooms. Only literal HTTP
loopback origins (127.0.0.1 or [::1]) are accepted. No redirects are followed.
The server must accept its target URL as the WebSocket Origin.

  --bun-url URL    Bun origin   (HARRHY_WORLD_BENCH_BUN_URL)
  --celld-url URL  Celld origin (HARRHY_WORLD_BENCH_CELLD_URL)
  --seconds N      1–30 whole seconds per scenario, default 5
                   (HARRHY_WORLD_BENCH_SECONDS)
  --help           Show help without connecting

Set one or both targets. Flags override env. Both targets must serve the same
map revision via /healthz. Runs 1, 6 and 12 players, with 60 deterministic
input slots/s per player. Skips late slots instead of bursting to catch up.
JSON reports ack latency for exact sequences observed in motion snapshots,
including in a 500 ms no-send drain. Ack jumps can hide processed or dropped
inputs; final ack watermark coverage is not proof of individual delivery.
Throughput counts application payload bytes and snapshot deliveries across
clients during the send window. Effective tick Hz divides total tick deltas
by total elapsed time between consecutive snapshots within each client.
`;

function loopback(value) {
  if (!/^http:\/\/(127\.0\.0\.1|\[::1\])(?::\d{1,5})?\/?$/.test(value)) {
    throw new Error(
      "Target must be a literal loopback HTTP origin (see --help)",
    );
  }
  return new URL(value);
}

function health(base) {
  return new Promise((resolve, reject) => {
    get(
      new URL("/healthz", base),
      { agent: false, signal: AbortSignal.timeout(setupMs) },
      (response) => {
        if (response.statusCode !== 200) {
          response.destroy();
          reject(new Error(`/healthz returned HTTP ${response.statusCode}`));
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("error", reject);
        response.on("data", (part) => {
          body += part;
          if (body.length > 4096)
            response.destroy(new Error("Oversized health response"));
        });
        response.on("end", () => {
          try {
            const { status, map, revision } = JSON.parse(body);
            if (
              status !== "ready" ||
              !["legacy", "bsp"].includes(map) ||
              typeof revision !== "string" ||
              !revision
            ) {
              throw new Error("Invalid World readiness response");
            }
            resolve({ map, revision });
          } catch (error) {
            reject(error);
          }
        });
      },
    ).on("error", reject);
  });
}

function percentiles(samples) {
  samples.sort((a, b) => a - b);
  const at = (p) => samples[Math.ceil(samples.length * p) - 1] ?? null;
  return { count: samples.length, p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

async function scenario(base, revision, players, seconds) {
  const url = new URL("/room", base);
  url.protocol = "ws:";
  url.searchParams.set("revision", revision);
  const clients = [];
  const ackMs = [],
    gapMs = [],
    gapTicks = [];
  let start = Infinity,
    end = Infinity,
    failure;
  let sentBytes = 0,
    receivedBytes = 0,
    snapshots = 0;
  const fail = (error) => {
    failure ??= error;
  };
  const check = () => {
    if (failure) throw failure;
  };
  const deadline = performance.now() + setupMs;
  async function waitFor(ready) {
    while (!ready()) {
      check();
      if (performance.now() >= deadline)
        throw new Error("Timed out waiting for room readiness");
      await sleep(5);
    }
    check();
  }

  try {
    // Serial joins give the movement patterns a consistent order within each scenario.
    for (let index = 0; index < players; index++) {
      const ws = new WebSocket(url, {
        origin: base.origin,
        agent: false,
        followRedirects: false,
        handshakeTimeout: setupMs,
        perMessageDeflate: false,
        maxPayload: 64 * 1024,
      });
      const client = { ws, sentAt: [null], ack: 0 };
      clients.push(client);
      ws.on("error", fail);
      ws.on("close", (code) =>
        fail(new Error(`Player ${index + 1} disconnected (${code})`)),
      );
      ws.on("message", (raw) => {
        const now = performance.now();
        const active = now >= start && now < end;
        try {
          const message = JSON.parse(raw.toString());
          if (active) receivedBytes += raw.length;
          if (message.type === "welcome") {
            if (
              message.revision !== revision ||
              typeof message.id !== "string" ||
              !message.id ||
              clients.some((peer) => peer.id === message.id)
            )
              throw new Error("Invalid welcome");
            client.id = message.id;
          }
          if (message.type !== "motion") return;
          const { tick, players: poses } = message;
          const own = poses.find(({ id }) => id === client.id);
          if (
            !own ||
            !Number.isSafeInteger(tick) ||
            tick < 0 ||
            !Number.isSafeInteger(own.ack) ||
            own.ack < client.ack ||
            own.ack >= client.sentAt.length
          )
            throw new Error("Invalid motion snapshot");
          const ids = new Set(poses.map(({ id }) => id));
          if (
            ids.size !== poses.length ||
            [...ids].some((id) => !clients.some((peer) => peer.id === id))
          ) {
            throw new Error(
              "Unexpected room occupants; use an empty disposable room",
            );
          }
          client.occupants = ids.size;
          if (now >= start && now < end + drainMs && own.ack > client.ack) {
            ackMs.push(now - client.sentAt[own.ack]);
            client.ack = own.ack;
          }
          if (!active) return;
          if (ids.size !== players)
            throw new Error("Incomplete room snapshot during measurement");
          snapshots++;
          if (client.last) {
            if (tick < client.last.tick)
              throw new Error("Snapshot tick regressed");
            gapMs.push(now - client.last.now);
            gapTicks.push(tick - client.last.tick);
          }
          client.last = { tick, now };
        } catch (error) {
          fail(error);
        }
      });
      await waitFor(() => client.id && client.occupants);
    }
    await waitFor(() =>
      clients.every((client) => client.occupants === players),
    );

    const slots = seconds * rate;
    start = performance.now();
    end = start + seconds * 1000;
    for (let slot = 0; slot < slots;) {
      const elapsed = performance.now() - start;
      if (elapsed >= seconds * 1000) break;
      const due = Math.floor((elapsed * rate) / 1000);
      if (due < slot) {
        await sleep(Math.max(1, Math.ceil((slot * 1000) / rate - elapsed)));
        continue;
      }
      check();
      slot = due + 1;
      for (const [index, client] of clients.entries()) {
        const phase = Math.floor((due + index * 13) / rate) % 4;
        const payload = JSON.stringify({
          seq: client.sentAt.length,
          forward: [1, 0, -1, 0][phase],
          strafe: [0, 1, 0, -1][phase],
          jump: (due + index * 13) % 120 < 12,
          yaw: (index * Math.PI) / 6,
          pitch: 0,
        });
        if (client.ws.bufferedAmount > 4096)
          throw new Error("Input socket backpressure");
        client.sentAt.push(performance.now());
        client.ws.send(payload, fail);
        sentBytes += payload.length;
      }
    }
    await sleep(Math.max(0, Math.ceil(end + drainMs - performance.now())));
    check();

    const sent = clients.reduce(
      (sum, client) => sum + client.sentAt.length - 1,
      0,
    );
    const atOrBelowFinalAck = clients.reduce(
      (sum, client) => sum + client.ack,
      0,
    );
    const planned = slots * players;

    const elapsed = sumSamples(gapMs);
    return {
      players,
      seconds,
      planned,
      sent,
      missedSendSlots: planned - sent,
      exactAckCoverage: sent ? ackMs.length / sent : null,
      finalAckWatermarkCoverage: sent ? atOrBelowFinalAck / sent : null,
      exactAckLatencyMs: percentiles(ackMs),
      snapshotGapMs: percentiles(gapMs),
      snapshotGapTicks: percentiles(gapTicks),
      effectiveTickHz:
        elapsed > 0 ? (sumSamples(gapTicks) * 1000) / elapsed : null,
      inputsPerSecond: sent / seconds,
      snapshotsPerSecond: snapshots / seconds,
      sentPayloadBytesPerSecond: sentBytes / seconds,
      receivedPayloadBytesPerSecond: receivedBytes / seconds,
    };
  } finally {
    await Promise.all(
      clients.map(({ ws }) => {
        if (ws.readyState === WebSocket.CLOSED) return Promise.resolve();
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            ws.terminate();
            resolve();
          }, 500);
          ws.once("close", () => {
            clearTimeout(timeout);
            resolve();
          });
          ws.close();
        });
      }),
    );
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      "bun-url": { type: "string" },
      "celld-url": { type: "string" },
      seconds: { type: "string" },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  const rawSeconds =
    values.seconds ?? process.env.HARRHY_WORLD_BENCH_SECONDS ?? "5";
  const seconds = Number(rawSeconds);
  if (!/^\d+$/.test(rawSeconds) || seconds < 1 || seconds > 30)
    throw new Error("--seconds must be a whole number from 1 to 30");
  const targets = ["bun", "celld"].flatMap((runtime) => {
    const value =
      values[`${runtime}-url`] ??
      process.env[`HARRHY_WORLD_BENCH_${runtime.toUpperCase()}_URL`];
    return value === undefined ? [] : [{ runtime, base: loopback(value) }];
  });
  if (!targets.length)
    throw new Error("Specify at least one target; see --help");
  if (targets.length === 2 && targets[0].base.href === targets[1].base.href)
    throw new Error("Use distinct origins for Bun and Celld");
  const readiness = await Promise.all(targets.map(({ base }) => health(base)));
  const [{ map, revision }] = readiness;
  if (
    !readiness.every(
      (target) => target.map === map && target.revision === revision,
    )
  ) {
    throw new Error("Targets must use the same World map and revision");
  }
  const results = [];
  for (const { runtime, base } of targets) {
    for (const players of [1, 6, 12]) {
      try {
        const metrics = await scenario(base, revision, players, seconds);
        results.push({ runtime, origin: base.origin, ...metrics });
      } catch (error) {
        throw new Error(`${runtime}, ${players} players: ${error.message}`, {
          cause: error,
        });
      }
    }
  }
  console.log(
    JSON.stringify(
      { map, revision, inputHzPerPlayer: rate, ackDrainMs: drainMs, results },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`World benchmark: ${error.message}`);
  process.exitCode = 1;
});
