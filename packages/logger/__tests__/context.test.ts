import assert from "node:assert/strict";
import { test } from "node:test";
import { createRouter } from "remix/router";
import { asyncContext, getContext } from "remix/middleware/async-context";
import { bindLogContext, createLogger, currentLog } from "../src/index.ts";
import { CurrentLog, log } from "../src/middleware.ts";

test("Remix context bridges the outer ambient record without a second completion", async () => {
  const records: Record<string, unknown>[] = [];
  const logger = createLogger({
    service: "fixture",
    sink: (record) => records.push(record),
  });
  const router = createRouter({ middleware: [asyncContext(), log()] });
  router.get("/", async (context) => {
    await Promise.resolve();
    assert.equal(context.get(CurrentLog), currentLog());
    assert.equal(getContext().get(CurrentLog), currentLog());
    currentLog()?.set({ operation: "fixture.route" });
    return new Response("ok");
  });
  await logger.request(new Request("https://example.test/"), () =>
    router.fetch("https://example.test/"),
  );
  assert.equal(records.length, 1);
  assert.equal(records[0]!.operation, "fixture.route");
  assert.equal(currentLog(), undefined);
  assert.throws(() => getContext(), /No request context/);
});

test("bound deferred callbacks isolate overlapping Remix requests and nested jobs", async () => {
  const records: Record<string, unknown>[] = [];
  const logger = createLogger({
    service: "fixture",
    sink: (record) => records.push(record),
  });
  const callbacks = new Map<string, () => Promise<void>>();
  const router = createRouter({ middleware: [asyncContext(), log()] });
  router.get("/:id", (context) => {
    const id = context.params.id;
    callbacks.set(
      id,
      bindLogContext(async () => {
        assert.equal(getContext().params.id, id);
        const request = currentLog()!;
        await request.child("job", { owner: id }).run(async () => {
          const job = currentLog()!;
          assert.notEqual(job, request);
          await job.child("job", { owner: `${id}.nested` }).run(async () => {
            await Promise.resolve();
            assert.equal(currentLog()?.parent, job);
          });
          assert.equal(currentLog(), job);
        });
        assert.equal(currentLog(), request);
      }),
    );
    return new Response("stream prepared");
  });
  await Promise.all(
    ["a", "b"].map((id) =>
      logger.request(new Request(`https://example.test/${id}`), () =>
        router.fetch(`https://example.test/${id}`),
      ),
    ),
  );
  assert.equal(records.length, 2);
  await Promise.all([callbacks.get("b")!(), callbacks.get("a")!()]);
  assert.equal(records.length, 6);
  assert.deepEqual(
    records
      .filter((record) => record.kind === "job")
      .map((record) => String(record.owner))
      .toSorted((a, b) => a.localeCompare(b)),
    ["a", "a.nested", "b", "b.nested"],
  );
  assert.equal(currentLog(), undefined);
  assert.throws(() => getContext(), /No request context/);
});

test("binding without context preserves no-context behavior and application errors", async () => {
  const callback = bindLogContext(() => {
    assert.equal(currentLog(), undefined);
    assert.throws(() => getContext(), /No request context/);
    throw new Error("original failure");
  });
  const logger = createLogger({
    service: "fixture",
    sink() {
      throw new Error("sink failed");
    },
  });
  await logger.open("job").run(() => {
    assert.throws(callback, /original failure/);
    assert.ok(currentLog());
  });
});
