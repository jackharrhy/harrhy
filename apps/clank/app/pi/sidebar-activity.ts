import { SessionReads } from "../../../pi/plugins/search/contract.ts";
import { SessionStatus } from "../../../pi/plugins/status/contract.ts";
import type { Ctx } from "../../../pi/src/runtime/chord.ts";
import type { Feed } from "./archive-availability.ts";
import type { ReadMarks } from "../sidebar/sidebar-indicators.ts";

export async function statusFeed(scope: Ctx) {
  const status = await scope.get(SessionStatus, {}, { readyTimeout: 1000 });
  if (status.variant !== "reader") return;
  return {
    state: status.state,
    fields: [status.statuses],
    read: () => status.statuses.value,
  };
}

export type LiveMarks = ReadMarks & {
  markRead(args: { session: string; through: number }): Promise<unknown>;
};

export async function readsFeed(
  scope: Ctx,
): Promise<Feed<LiveMarks> | undefined> {
  const marks = await scope.get(SessionReads, {}, { readyTimeout: 1000 });
  if (marks.variant !== "owner") return;
  return {
    state: marks.state,
    fields: [marks.answers, marks.reads],
    read: () => {
      if (
        scope.abortSignal?.aborted ||
        marks.variant !== "owner" ||
        marks.state.value.kind !== "live"
      )
        throw Error("Owner SessionReads ended");
      return {
        answers: marks.answers.value,
        reads: marks.reads.value,
        markRead: (args) => marks.markRead(args, scope),
      };
    },
  };
}

// One attempt per answer per connection, even while awaiting acknowledgement
// or after rejection. This cursor never contributes to the unread projection.
export function mainReadMarker(
  current: (session: string) => LiveMarks | undefined,
) {
  const attempted = new Map<string, number>();
  return (session: string) => {
    const marks = current(session);
    if (!marks) return;
    const through = marks.answers[session] ?? 0;
    if (
      through <= (marks.reads[session] ?? 0) ||
      through <= (attempted.get(session) ?? 0)
    )
      return;
    attempted.set(session, through);
    void marks.markRead({ session, through }).catch(() => {});
  };
}

// Sample optional holds at document completion; neither a missing contract
// nor a slow optional feed should spend the catalog/chat deadline.
export function startSnapshotFeed<T>(pending: Promise<Feed<T> | undefined>) {
  let feed: Feed<T> | undefined;
  void pending.then(
    (ready) => {
      feed = ready;
    },
    () => {},
  );
  return () => {
    try {
      if (feed?.state.value.kind === "live") return feed.read();
    } catch {
      // A lost member is not an authoritative last-known value.
    }
  };
}
