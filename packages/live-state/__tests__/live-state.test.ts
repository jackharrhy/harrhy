import assert from "node:assert/strict";
import test from "node:test";
import { RpcStub } from "capnweb";
import { channel } from "../channel.ts";
import { watch, type Sink } from "../watch.ts";

test("slow delivery coalesces wakes and a bad ack retires once", async () => {
  let version = 0;
  const seen: number[] = [];
  const first = Promise.withResolvers<number>();
  const borrowed = new RpcStub<Sink<string>>(async (frame) => {
    if (frame.kind !== "snapshot") throw new Error("expected a snapshot");
    seen.push(frame.at);
    return seen.length === 1 ? first.promise : -1;
  });
  let failures = 0,
    retirements = 0;
  const stream = channel<string>(
    null,
    borrowed,
    () => ({ frame: { kind: "snapshot", at: version, items: [] } }),
    () => {},
    () => failures++,
    () => retirements++,
  );
  const delivered = stream.wake();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, [0]);
  assert.ok(stream.due > 0);
  for (version = 1; version < 10; version++) await stream.wake();
  assert.deepEqual(seen, [0]);
  first.resolve(0);
  await delivered;
  stream.stop();
  await stream.wake();
  assert.deepEqual(seen, [0, 10]);
  assert.deepEqual([failures, retirements, stream.due], [1, 1, 0]);
  borrowed[Symbol.dispose]();
});

test("closing during an async read suppresses delivery", async () => {
  const gate = Promise.withResolvers<void>();
  let calls = 0,
    retired = 0;
  const borrowed = new RpcStub<Sink<string>>(async () => ++calls);
  const stream = channel<string>(
    null,
    borrowed,
    async () => {
      await gate.promise;
      return { frame: { kind: "same", at: 4 } };
    },
    () => {},
    assert.fail,
    () => retired++,
  );
  const pending = stream.wake();
  stream.stop();
  gate.resolve();
  await pending;
  assert.deepEqual([calls, retired], [0, 1]);
  borrowed[Symbol.dispose]();
});

test("reconnect resumes only within scope and ignores a retired callback", async () => {
  const rendered: (readonly number[] | null)[] = [];
  const starts: (number | null)[] = [];
  const sinks: Sink<number>[] = [];
  const port = {
    async start(_id: string, after: number | null, sink: Sink<number>) {
      starts.push(after);
      sinks.push(sink);
    },
    async stop() {},
  };
  const view = watch<number>((items) => rendered.push(items));
  await view.reconnect(port, "a");
  assert.equal(await sinks[0]({ kind: "snapshot", at: 2, items: [42] }), 2);
  await view.reconnect(port, "a");
  await view.reconnect(port, "b");
  assert.deepEqual(starts, [null, 2, null]);
  assert.equal(await sinks[1]({ kind: "same", at: 2 }), null);
  assert.equal(rendered.at(-1), null);
  await view.dispose();
  await view.reconnect(port, "a");
  assert.equal(starts.length, 3);
});
