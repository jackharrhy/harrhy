import type { Watchable } from "@earendil-works/chord/watch";
import { SessionReads } from "../../pi/plugins/search/contract.ts";
import { SessionStatus } from "../../pi/plugins/status/contract.ts";
import type { Operation } from "../../pi/plugins/sessions/contract.ts";
import { runState } from "../../pi/plugins/sessions/sidebar/run-state.ts";
import type { Ctx } from "../../pi/src/runtime/chord.ts";
import type { Feed, Work } from "./archive-availability.ts";

export async function workFeed(
  scope: Ctx,
  operations: Watchable<readonly Operation[]>,
): Promise<Feed<Work> | undefined> {
  const status = await scope.get(SessionStatus, {});
  if (status.variant !== "reader") return;
  return {
    state: status.state,
    fields: [status.statuses, operations],
    read: () => ({
      statuses: status.statuses.value,
      operations: operations.value,
    }),
  };
}

export async function unreadFeed(scope: Ctx) {
  const marks = await scope.get(SessionReads, {});
  if (marks.variant !== "owner") return;
  return {
    state: marks.state,
    fields: [marks.answers, marks.reads],
    read: () => {
      const reads = marks.reads.value;
      return Object.entries(marks.answers.value)
        .filter(([id, answer]) => answer > (reads[id] ?? 0))
        .map(([id]) => id);
    },
  };
}

export function activityIds(work: Work, unread: string[]) {
  const ids = new Set<string>();
  for (const [id, entry] of Object.entries(work.statuses)) {
    if (
      entry.busy.length ||
      entry.error !== undefined ||
      runState(entry.failure, false, undefined).kind === "failed"
    )
      ids.add(id);
  }
  for (const id of unread) ids.add(id);
  for (const job of work.operations) {
    ids.add(job.session);
    if (job.phase === "running" && job.copying && job.target)
      ids.add(job.target);
  }
  return [...ids];
}

export async function sidebarActivity(
  scope: Ctx,
  operations: Watchable<readonly Operation[]>,
) {
  const [work, unread] = await Promise.all([
    workFeed(scope, operations),
    unreadFeed(scope),
  ]);
  return work?.state.value.kind === "live" &&
    unread?.state.value.kind === "live"
    ? activityIds(work.read(), unread.read())
    : [];
}
