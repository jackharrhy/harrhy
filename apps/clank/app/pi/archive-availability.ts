import type { RefState } from "@earendil-works/chord";
import { withCancel, type Context } from "@earendil-works/chord/context";
import type { NativeWatchable, Watchable } from "@earendil-works/chord/watch";
import type { Operation } from "../../../pi/plugins/sessions/contract.ts";
import type { Status } from "../../../pi/plugins/status/contract.ts";

export type Work = {
  statuses: Readonly<Record<string, Status>>;
  operations: readonly Operation[];
};

export function workAllowsArchive(
  work: Work,
  session: string,
  conversation?: number,
) {
  if (
    work.operations.some(
      (op) =>
        op.phase === "running" &&
        (op.session === session || op.target === session),
    )
  )
    return false;
  // The live status map is complete. No entry means no worker.
  const busy = work.statuses[session]?.busy;
  return conversation === undefined
    ? !busy?.length
    : !busy?.includes(conversation);
}

export type Feed<T> = {
  state: NativeWatchable<RefState>;
  fields: readonly Watchable<unknown>[];
  read(): T;
};

// Give dispatch a reader of the current replica, not the last rendered value.
// A failed/retired field can retain its last value; discard this hold until reconnect.
export async function followLive<T>(
  parent: Context,
  feed: Feed<T>,
  changed: (read: () => T | undefined) => Promise<unknown>,
) {
  const { context, cancel } = withCancel(parent);
  const current = () => {
    if (context.abortSignal?.aborted || feed.state.value.kind !== "live")
      return;
    try {
      return feed.read();
    } catch {
      // A member failed before its listener ran.
      return undefined;
    }
  };
  try {
    const [binding, fields] = await Promise.all([
      feed.state.watch(context),
      Promise.all(feed.fields.map((field) => field.watch(context))),
    ]);
    if (binding.value.kind !== "live") return;
    binding.start(async (call) => {
      if (call.kind !== "value" || call.value.kind !== "live") cancel();
    });
    for (const field of fields)
      field.start(async (call) => {
        if (call.kind !== "value" || call.retired) cancel();
        else await changed(current);
      });
    const ended = Promise.race([
      binding.closed,
      ...fields.map((field) => field.closed),
    ]).then(() => cancel());
    await changed(current);
    await ended;
  } finally {
    cancel();
    await changed(current);
  }
}
