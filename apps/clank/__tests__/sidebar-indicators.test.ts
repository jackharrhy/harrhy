import assert from "node:assert/strict";
import { test } from "node:test";
import type { Operation } from "../../pi/plugins/sessions/contract.ts";
import type { Status } from "../../pi/plugins/status/contract.ts";
// Resolve native Pi contracts from source, like the owner bundle.
import "../../pi/src/source-resolver.ts";
const { failedRun, projectSidebar } =
  await import("../app/sidebar/sidebar-indicators.ts");
const { mainReadMarker } = await import("../app/pi/sidebar-activity.ts");
const { boundedSnapshot } = await import("../app/server/snapshot.ts");

const rows = ["source", "target", "other"].map((id) => ({ id, main: 3 }));
const worker: Status = {
  running: true,
  tasks: 1,
  work: {},
  busy: [5],
  failure: { reason: "no_model" },
};
const running: Operation = {
  id: "1",
  session: "source",
  target: "target",
  kind: "fork",
  phase: "running",
  copying: true,
};
const failed: Operation = {
  id: "2",
  session: "source",
  target: "other",
  kind: "relocate",
  phase: "failed",
  error: "disk full",
};
const marks = {
  answers: { source: 5, target: 4, other: 1 },
  reads: { source: 4, target: 4, other: 9 },
};

const source = (status: Status, ops?: Operation[]) =>
  projectSidebar(rows, { source: status }, ops, marks).indicators.source;

test("failureOf priorities; a child can stay busy alongside a main failure and unread answer", () => {
  assert.deepEqual(source({ ...worker, error: "" }, [failed]), {
    failure: "Worker failed: ",
    unread: true,
    busy: [5],
  });
  assert.deepEqual(
    source(worker, [running, failed, { ...failed, id: "3", kind: "fork" }]),
    { failure: "Move failed: disk full", unread: true, busy: [5] },
  );
  assert.equal(source(worker).failure, "Failed: Its model is not available");
  assert.equal(
    source({ ...worker, failure: { reason: "model_error", detail: "quota" } })
      .failure,
    "Failed: quota",
  );
  assert.deepEqual(source({ ...worker, busy: [3, 5] }), {
    unread: true,
    busy: [3, 5],
  });
});

test("partial feeds project independently; running/copying jobs affect recency, not busy or failure", () => {
  const projected = projectSidebar(rows, undefined, [running, failed], marks);
  assert.deepEqual(projected.activeIds, ["source", "target"]);
  assert.deepEqual(
    { ...projected.indicators },
    { source: { failure: "Move failed: disk full", unread: true } },
  );
  for (const [kind, label] of [
    ["clone", "Clone"],
    ["fork", "Fork"],
    ["archive", "Archive"],
  ] as const) {
    assert.deepEqual(
      projectSidebar(rows, undefined, [{ ...failed, kind }]).indicators.source,
      { failure: `${label} failed: disk full` },
    );
  }
  assert.deepEqual(
    projectSidebar(rows, undefined, [{ ...running, copying: false }]).activeIds,
    ["source"],
  );
  assert.deepEqual(
    { ...projectSidebar(rows, undefined, undefined, marks).indicators },
    { source: { unread: true } },
  );
  assert.deepEqual(
    projectSidebar(rows, {
      source: { ...worker, busy: [], failure: undefined },
    }).activeIds,
    [],
  );
});

test("named child status uses its own conversation and last run, without promoting stops or idle to failures", () => {
  assert.equal(
    failedRun({ reason: "model_error", detail: "quota" }, true),
    undefined,
  );
  assert.equal(
    failedRun({ reason: "model_error", detail: "quota" }, false),
    "quota",
  );
  for (const reason of ["aborted", "turn_limit", "reset", "nothing_to_answer"])
    assert.equal(failedRun({ reason }, false), undefined);
});

test("read receipts sample current live state and never retry the same answer or clear it locally", async () => {
  const calls: unknown[] = [];
  const pending = Promise.withResolvers<void>();
  const state = {
    answers: { source: 9 },
    reads: { source: 9 },
    markRead: (args: unknown) => {
      calls.push(args);
      return pending.promise;
    },
  };
  let live = true;
  const mark = mainReadMarker((id) =>
    live && id === "source" ? state : undefined,
  );
  mark("source");
  state.answers.source++;
  mark("other");
  live = false;
  mark("source");
  assert.deepEqual(calls, []);
  live = true;
  mark("source");
  mark("source");
  pending.reject(Error("ended"));
  await Promise.resolve();
  mark("source");
  assert.deepEqual(calls, [{ session: "source", through: 10 }]);
  assert.equal(state.reads.source, 9);
  state.answers.source++;
  mark("source");
  assert.deepEqual(calls.at(1), { session: "source", through: 11 });
});

test("oversized optional indicators do not displace a usable document seed", () => {
  const seed = {
    rows: [],
    children: {},
    activeIds: ["source"],
    chat: { view: null },
  };
  assert.deepEqual(
    boundedSnapshot({
      ...seed,
      indicators: { source: { failure: "あ".repeat(200_000) } },
    }),
    seed,
  );
});
