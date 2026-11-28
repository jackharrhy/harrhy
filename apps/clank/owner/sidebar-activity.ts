import type { Watchable } from "@earendil-works/chord/watch";
import { SessionReads } from "../../pi/plugins/search/contract.ts";
import { SessionStatus } from "../../pi/plugins/status/contract.ts";
import type { Operation } from "../../pi/plugins/sessions/contract.ts";
import { runState } from "../../pi/plugins/sessions/sidebar/run-state.ts";
import type { Ctx } from "../../pi/src/runtime/chord.ts";

export async function sidebarActivity(
  scope: Ctx,
  operations: Watchable<readonly Operation[]>,
  publish?: (ids: string[]) => Promise<unknown>,
) {
  const [status, marks] = await Promise.all([
    scope.get(SessionStatus, {}),
    scope.get(SessionReads, {}),
  ]);
  if (status.variant !== "reader" || marks.variant !== "owner") return [];
  const [statuses, answers, reads, jobs] = await Promise.all([
    status.statuses.watch(scope),
    marks.answers.watch(scope),
    marks.reads.watch(scope),
    operations.watch(scope),
  ]);
  const collect = () => {
    const ids = new Set<string>();
    for (const [id, entry] of Object.entries(statuses.value)) {
      if (
        entry.busy.length ||
        entry.error !== undefined ||
        runState(entry.failure, false, undefined).kind === "failed"
      )
        ids.add(id);
    }
    for (const [id, answer] of Object.entries(answers.value)) {
      if (answer > (reads.value[id] ?? 0)) ids.add(id);
    }
    for (const job of jobs.value) {
      ids.add(job.session);
      if (job.phase === "running" && job.copying && job.target)
        ids.add(job.target);
    }
    return [...ids];
  };
  if (!publish) return collect();
  const watchers = [statuses, answers, reads, jobs] as const;
  try {
    for (const watch of watchers)
      watch.start(async () => {
        await publish(collect());
      });
    await publish(collect());
    await Promise.race(watchers.map((watch) => watch.closed));
    return [];
  } finally {
    await Promise.all(watchers.map((watch) => watch.stop()));
  }
}
