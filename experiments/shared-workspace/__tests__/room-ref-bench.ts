import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createConnection, createServer, type Socket } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { boot } from "../toy.ts";
import { wireSession } from "./room-ref-fixture.ts";

async function relay(source: Socket, target: Socket) {
  try {
    for await (const chunk of source) {
      // Serial application-level delay, not IP packet shaping.
      await sleep(20);
      if (target.destroyed) break;
      if (!target.write(chunk)) await once(target, "drain");
    }
  } finally {
    target.destroy();
  }
}

async function delayedLink(upstream: string) {
  const sockets = new Set<Socket>();
  function track(socket: Socket) {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  }
  const server = createServer((client) => {
    const backend = createConnection(
      Number(new URL(upstream).port),
      "127.0.0.1",
    );
    track(client);
    track(backend);
    void relay(client, backend).catch(() => backend.destroy());
    void relay(backend, client).catch(() => client.destroy());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    url: `ws://127.0.0.1:${address.port}/rpc`,
    async close() {
      for (const socket of sockets) socket.destroy();
      if (server.listening)
        await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function measure(label: string, read: () => unknown, count: number) {
  await read();
  const ms: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    const result = await read();
    assert.ok(Array.isArray(result) && result.length === 2);
    ms.push(performance.now() - start);
  }
  ms.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      label,
      count,
      p50: ms[Math.floor(count * 0.5)],
      p95: ms[Math.floor(count * 0.95)],
    }),
  );
}

async function run() {
  const [, , same, distinct] = process.argv;
  assert.match(same, /^\d+$/);
  assert.match(distinct, /^\d+$/);
  assert.notEqual(same, distinct);
  const app = await boot(":memory:");
  try {
    const local = app.local("home", "owner");
    const ref = local.reference();
    for (let rep = 0; rep < 3; rep++) {
      await measure(
        "observed/in-process",
        () => local.resolve(ref).read(),
        1000,
      );
      for (const cpu of rep % 2 ? [distinct, same] : [same, distinct]) {
        const child = spawn(
          "/bin/taskset",
          [
            "-c",
            cpu,
            process.execPath,
            fileURLToPath(import.meta.url),
            "server",
          ],
          {
            stdio: ["ignore", "inherit", "inherit", "ipc"],
          },
        );
        const exited = once(child, "exit");
        try {
          const [url] = await Promise.race([
            once(child, "message"),
            exited.then(() => {
              throw new Error("Benchmark server exited early");
            }),
          ]);
          assert.equal(typeof url, "string");
          const label =
            cpu === same
              ? "observed/loopback-same-cpu"
              : "observed/loopback-distinct-cpus";
          const session = await wireSession(String(url), "home", "owner");
          try {
            const remoteRef = await session.api.reference();
            await measure(
              label,
              () => session.api.resolve(remoteRef).read(),
              250,
            );
            if (cpu === distinct) {
              const proxy = await delayedLink(String(url));
              try {
                const delayed = await wireSession(proxy.url, "home", "owner");
                await measure(
                  "simulated/20ms-per-direction",
                  () => delayed.api.resolve(remoteRef).read(),
                  20,
                );
                // Cut the link, revoke independently, and reconnect using the same locator.
                const marty = await wireSession(proxy.url, "home", "marty");
                const stale = await marty.api.resolve(remoteRef);
                assert.ok((await stale.read()).length > 0);
                await proxy.close();
                await session.api.setMarty("familiar", false, false);
                await assert.rejects(async () => await stale.read());
                const repaired = await delayedLink(String(url));
                try {
                  const reconnected = await wireSession(
                    repaired.url,
                    "home",
                    "marty",
                  );
                  try {
                    await assert.rejects(
                      async () => await reconnected.api.resolve(remoteRef),
                      /DENIED/,
                    );
                    await session.api.setMarty("familiar", true, false);
                    assert.ok(
                      (await reconnected.api.resolve(remoteRef).read()).length >
                        0,
                    );
                  } finally {
                    await reconnected.disconnect();
                  }
                } finally {
                  await repaired.close();
                }
              } finally {
                await proxy.close();
              }
            }
          } finally {
            await session.disconnect();
          }
        } finally {
          if (child.connected) child.disconnect();
          await exited;
        }
      }
    }
  } finally {
    await app.close();
  }
}

if (process.argv[2] === "server") {
  const app = await boot(":memory:");
  process.on("disconnect", () => {
    void app.close();
  });
  process.send?.(app.urls.home);
} else await run();
