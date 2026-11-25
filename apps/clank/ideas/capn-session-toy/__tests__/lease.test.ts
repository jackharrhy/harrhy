import { toxiproxy } from "./toxiproxy-fixture.ts";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { RpcTarget } from "capnweb";
import {
  dial,
  leaseMs,
  now,
  type OwnerAcl,
  type Sink,
  type Stream,
} from "./lease-process.ts";

async function start(t: TestContext, role: string, argument: string) {
  const child = fork(
    fileURLToPath(new URL("./lease-process.ts", import.meta.url)),
    [role, argument],
    {
      execArgv: ["--max-old-space-size=64"],
    },
  );
  const exit = once(child, "exit");
  t.after(async () => {
    if (child.connected) child.disconnect();
    await exit;
  });
  const [url] = await Promise.race([
    once(child, "message") as Promise<[unknown]>,
    exit.then(() => {
      throw new Error(`Child exited before ready: ${role}`);
    }),
  ]);
  assert.equal(typeof url, "string");
  const endpoint = String(url);
  t.after(async () => {
    await exit;
    await assert.rejects(
      dial<Stream>(endpoint, "stream-owner"),
      /ECONNREFUSED/,
    );
  });
  return endpoint;
}

class Inbox extends RpcTarget implements Sink {
  chunks: number[] = [];
  chunk(value: { seq: number }) {
    this.chunks.push(value.seq);
  }
}

async function until(check: () => Promise<boolean>) {
  const end = now() + 2500;
  while (!(await check())) {
    assert.ok(now() < end, "barrier was not reached");
    await sleep(5);
  }
}

for (const useProxy of [false, true])
  test(
    (useProxy ? "Toxiproxy: " : "") +
      "three processes: committed revoke, enforced barrier, missed notification and stale epochs",
    {
      timeout: 7000,
      skip: useProxy && process.env.HARRHY_CLANK_TOXIPROXY !== "1",
    },
    async (t) => {
      const dir = mkdtempSync("./lease-");
      const authorityUrl = await start(t, "authority", join(dir, "acl.sqlite"));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      const proxy = useProxy
        ? await toxiproxy(t, authorityUrl, 0, 18483)
        : undefined;
      const urls = await Promise.all([
        start(t, "a", authorityUrl),
        start(t, "b", proxy?.url ?? authorityUrl),
      ]);
      const { api: authority } = await dial<OwnerAcl>(
        authorityUrl,
        "authority-owner",
      );
      await assert.rejects(dial<OwnerAcl>(authorityUrl, "stream-marty"), /403/);
      const workers = await Promise.all(
        urls.map(async (url) => {
          const { api: owner } = await dial<Stream>(url, "stream-owner");
          const { api: marty } = await dial<Stream>(url, "stream-marty");
          const ownerInbox = new Inbox();
          await owner.open().watch(ownerInbox);
          await assert.rejects(async () => await marty.reconnect(), /DENIED/);
          return { owner, marty, ownerInbox };
        }),
      );

      async function register() {
        return Promise.all(
          workers.map(async ({ owner, marty }) => {
            const attachStarted = now();
            await owner.reconnect();
            const reconnectMs = now() - attachStarted;
            const room = await marty.open();
            const inbox = new Inbox();
            await room.watch(inbox);
            return { room, inbox, reconnectMs };
          }),
        );
      }
      async function emit() {
        const marks = await Promise.all(
          workers.map(async ({ owner }) => await owner.emit()),
        );
        assert.deepEqual(
          marks.map(
            (list) => list.filter((mark) => mark.reader === "owner").length,
          ),
          [1, 1],
        );
        return marks.map(
          (list) => list.find((mark) => mark.reader === "marty")?.at,
        );
      }

      const first = await register();
      const before = await emit();
      assert.deepEqual(
        before.map((at) => at !== undefined),
        [true, true],
      );
      const started = now();
      const revoked = await authority.change(false);
      const committedAckMs = now() - started;
      await until(
        async () => (await authority.status(revoked.epoch)) === "enforced",
      );
      const enforcedObservedMs = now() - started;
      assert.deepEqual(await emit(), [undefined, undefined]);
      for (const [index, { marty }] of workers.entries()) {
        await assert.rejects(async () => await marty.open(), /DENIED/);
        await assert.rejects(
          async () => await first[index].room.watch(new Inbox()),
          /DENIED/,
        );
        assert.deepEqual(first[index].inbox.chunks, [1]);
      }

      await authority.change(true);
      const during = await register();
      assert.deepEqual(
        (await emit()).map((at) => at !== undefined),
        [true, true],
      );
      await proxy?.enabled(false);
      const droppedStarted = now();
      const dropped = await authority.change(false, proxy ? undefined : "b");
      const droppedCommittedAckMs = now() - droppedStarted;
      await until(
        async () => (await workers[0].owner.leaseStatus()) === "closed",
      );
      await assert.rejects(async () => await workers[0].marty.open(), /DENIED/);
      assert.equal(await authority.status(dropped.epoch), "pending");
      const [, lastB] = await emit();
      assert.ok(
        lastB !== undefined && lastB >= dropped.committedAt,
        "live lease permits a post-commit enqueue",
      );
      assert.ok(lastB - dropped.committedAt < leaseMs);
      await until(
        async () => (await workers[1].owner.leaseStatus()) === "closed",
      );
      const expiryObservedMs = now() - dropped.committedAt;
      assert.deepEqual(await emit(), [undefined, undefined]);
      await assert.rejects(async () => await workers[1].marty.open(), /DENIED/);
      // Expiry is a local safety boundary, not an authority confirmation.
      assert.equal(await authority.status(dropped.epoch), "pending");
      await proxy?.enabled(true);
      await workers[1].owner.reconnect();
      await until(
        async () => (await authority.status(dropped.epoch)) === "enforced",
      );

      await authority.change(true);
      for (const [index, { owner }] of workers.entries()) {
        await owner.reconnect();
        await assert.rejects(
          async () => await during[index].room.watch(new Inbox()),
          /DENIED/,
        );
      }
      const fresh = await register();
      assert.deepEqual(
        (await emit()).map((at) => at !== undefined),
        [true, true],
      );
      assert.deepEqual(
        first.map(({ inbox }) => inbox.chunks),
        [[1], [1]],
      );
      assert.deepEqual(
        during.map(({ inbox }) => inbox.chunks),
        [[3], [3, 4]],
      );
      assert.deepEqual(
        fresh.map(({ inbox }) => inbox.chunks),
        [[6], [6]],
      );
      assert.deepEqual(
        workers.map(({ ownerInbox }) => ownerInbox.chunks),
        [
          [1, 2, 3, 4, 5, 6],
          [1, 2, 3, 4, 5, 6],
        ],
      );
      t.diagnostic(
        JSON.stringify({
          committedAckMs,
          enforcedObservedMs,
          normalCommitToLastEnqueueMs: before.map(
            (at) => at! - revoked.committedAt,
          ),
          droppedCommittedAckMs,
          droppedCommitToLastEnqueueMs: lastB - dropped.committedAt,
          expiryObservedMs,
          initialAttachAndLeaseMs: first.map(({ reconnectMs }) => reconnectMs),
        }),
      );
    },
  );
