import { toxiproxy } from "./toxiproxy-fixture.ts";
import { wireSession } from "./room-ref-fixture.ts";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { boot, type Host, type Principal, type RoomRef } from "../toy.ts";

type App = Awaited<ReturnType<typeof boot>>;

const adapters = {
  async local(app: App, host: Host, principal: Principal) {
    return { api: app.local(host, principal), disconnect() {} };
  },
  async "capn-web"(app: App, host: Host, principal: Principal) {
    return wireSession(app.urls[host], host, principal);
  },
};

type Connect = (
  app: App,
  host: Host,
  principal: Principal,
) => ReturnType<(typeof adapters)[keyof typeof adapters]>;

async function conformance(t: TestContext, app: App, connect: Connect) {
  const { api: owner } = await connect(app, "home", "owner");
  const { api: away } = await connect(app, "away", "owner");
  const { api: outsider } = await connect(app, "home", "outsider");
  const marty = await connect(app, "home", "marty");
  const ref = await owner.reference();
  const probeStarted = performance.now();
  for (let i = 0; i < 10; i++)
    assert.ok((await marty.api.resolve(ref).read()).length);
  t.diagnostic(
    `resolve+read ×10: ${(performance.now() - probeStarted).toFixed(2)} ms`,
  );
  const scoped = await owner.reference("scoped");
  assert.notEqual(ref, scoped);
  assert.match((await owner.resolve(scoped).read())[0].text, /home\/scoped/);
  await assert.rejects(async () => await away.resolve(ref), /BAD_REF/);
  await assert.rejects(
    async () => await owner.resolve("pasted" as RoomRef),
    /BAD_REF/,
  );
  await assert.rejects(async () => await outsider.resolve(ref), /DENIED/);
  const staleRoom = await marty.api.resolve(ref);
  assert.match((await staleRoom.read())[0].text, /home\/familiar/);

  // Disconnect first: the client cannot rely on observing a revoke notice.
  const partitionStarted = performance.now();
  await marty.disconnect();
  t.diagnostic(
    `disconnect barrier: ${(performance.now() - partitionStarted).toFixed(2)} ms`,
  );
  await owner.setMarty("familiar", false, false);
  const reconnected = await connect(app, "home", "marty");
  await assert.rejects(
    async () => await reconnected.api.resolve(ref),
    /DENIED/,
  );
  await owner.setMarty("familiar", true, false);
  await assert.rejects(async () => await staleRoom.read());
  assert.match(
    (await reconnected.api.resolve(ref).read())[0].text,
    /home\/familiar/,
  );
  await assert.rejects(
    async () => await reconnected.api.resolve(scoped),
    /DENIED/,
  );
}

for (const [adapter, connect] of Object.entries(adapters)) {
  test(`RoomRef conformance: ${adapter}`, async (t) => {
    const app = await boot(":memory:");
    t.after(() => app.close());
    await conformance(t, app, connect);
  });
}

for (const latency of [0, 20]) {
  test(
    `RoomRef conformance: Toxiproxy ${latency}ms per direction`,
    {
      skip: process.env.HARRHY_CLANK_TOXIPROXY !== "1",
      timeout: 5000,
    },
    async (t) => {
      const app = await boot(":memory:");
      t.after(() => app.close());
      const proxy = await toxiproxy(t, app.urls.home, latency);
      let partitioned = false;
      await conformance(t, app, async (fixture, host, principal) => {
        if (host !== "home" || principal !== "marty")
          return adapters["capn-web"](fixture, host, principal);
        if (partitioned) await proxy.enabled(true);
        const session = await wireSession(proxy.url, host, principal);
        return {
          api: session.api,
          async disconnect() {
            // Unlike a silent partition, disabling a proxy actively closes TCP.
            await proxy.enabled(false);
            await assert.rejects(
              wireSession(proxy.url, host, principal),
              /ECONNREFUSED/,
            );
            partitioned = true;
          },
        };
      });

      // timeout=0 suppresses downstream bytes without closing the connection.
      const client = await wireSession(proxy.url, "home", "marty");
      const ref = await client.api.reference();
      await proxy.blackhole();
      const held = Promise.resolve(client.api.resolve(ref).read());
      const outcome = held.then(
        () => "reply",
        () => "closed",
      );
      const started = performance.now();
      try {
        assert.equal(await Promise.race([outcome, sleep(100, "held")]), "held");
        t.diagnostic(
          `downstream blackhole held reply for ${(performance.now() - started).toFixed(2)} ms observation`,
        );
      } finally {
        await client.disconnect();
      }
      assert.equal(await outcome, "closed");
    },
  );
}

test(
  "Toxiproxy lost commit acknowledgment preserves exactly one transcript input",
  {
    skip: process.env.HARRHY_CLANK_TOXIPROXY !== "1",
    timeout: 5000,
  },
  async (t) => {
    const app = await boot(":memory:");
    t.after(() => app.close());
    const proxy = await toxiproxy(t, app.urls.home, 0);
    const owner = await wireSession(app.urls.home, "home", "owner");
    const witness = await owner.api.open();
    const sender = await wireSession(proxy.url, "home", "owner");
    const room = await sender.api.open();
    await proxy.blackhole();
    const result = Promise.resolve(
      room.send("proxy-lost-ack", "synthetic input"),
    ).then(
      () => "delivered",
      () => "disconnected",
    );
    for (let attempts = 0; (await witness.read()).length === 2; attempts++) {
      assert.ok(attempts < 100, "no committed input observed");
      await sleep(10);
    }
    await proxy.enabled(false);
    assert.equal(await result, "disconnected");
    const retry = await wireSession(app.urls.home, "home", "owner");
    assert.deepEqual(
      await retry.api.open().send("proxy-lost-ack", "synthetic input"),
      {
        id: "proxy-lost-ack",
        route: "home/familiar",
        seq: 2,
      },
    );
    assert.equal((await witness.read()).length, 4);
  },
);
