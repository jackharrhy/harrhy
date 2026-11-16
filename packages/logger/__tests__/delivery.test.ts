import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createLogger, currentLog, jsonSink } from "../src/index.ts";

test("JSON sink writes one parseable line with completion time and scalar types", async () => {
  const write = mock.method(console, "log", () => {});
  try {
    await createLogger({ service: "fixture", sink: jsonSink })
      .open("job", { count: 2 })
      .run(() => {});
    assert.equal(write.mock.calls.length, 1);
    const args = write.mock.calls[0]!.arguments;
    assert.equal(args.length, 1);
    const record = JSON.parse(args[0] as string);
    assert.equal(record.service, "fixture");
    assert.equal(record.count, 2);
    assert.equal(typeof record.duration_ms, "number");
    assert.ok(Number.isFinite(Date.parse(record.timestamp)));
  } finally {
    write.mock.restore();
  }
});

test("sink and sampling failures cannot replace application results or exceptions", async () => {
  const logger = createLogger({
    service: "fixture",
    sink() {
      throw new Error("sink unavailable");
    },
    sample: {
      keep() {
        throw new Error("predicate failed");
      },
    },
  });
  const response = new Response("application result", { status: 201 });
  assert.equal(
    await logger.request(new Request("https://example.test/"), () => response),
    response,
  );
  const original = new Error("application failure");
  await assert.rejects(
    logger.open("job").run(() => {
      throw original;
    }),
    (error) => error === original,
  );
  const unusual = new Error("original");
  Object.defineProperty(unusual, "code", {
    get() {
      throw new Error("metadata getter");
    },
  });
  await assert.rejects(
    logger.open("job").run(() => {
      throw unusual;
    }),
    (error) => error === unusual,
  );
});

test("concurrent scopes keep their own context and retain failures at zero success sampling", async () => {
  const records: Record<string, unknown>[] = [];
  const logger = createLogger({
    service: "fixture",
    sample: { rate: 0 },
    sink(record) {
      records.push(record);
    },
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await Promise.all([
    logger.open("job", { job_id: "first" }).run(async (log) => {
      await gate;
      assert.equal(currentLog(), log);
      log.fail(new Error("failed"));
    }),
    logger.open("job", { job_id: "second" }).run(async (log) => {
      assert.equal(currentLog(), log);
      log.warn("recovered");
      release();
    }),
    logger.open("job", { job_id: "sampled-success" }).run(() => {}),
  ]);
  assert.deepEqual(
    records
      .map((record) => String(record.job_id))
      .toSorted((a, b) => a.localeCompare(b)),
    ["first", "second"],
  );
  assert.equal(currentLog(), undefined);
});
