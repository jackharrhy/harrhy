import type { Child } from "../../../pi/plugins/subagents/contract.ts";
import type { Operation } from "../../../pi/plugins/sessions/contract.ts";
import {
  failureWords,
  runState,
} from "../../../pi/plugins/sessions/sidebar/run-state.ts";
import type {
  RunFailure,
  Status,
} from "../../../pi/plugins/status/contract.ts";

export type Indicator = { failure?: string; unread?: boolean; busy?: number[] };
export type RowMarks = { failure?: string; unread?: boolean; running?: number };

export function sessionMarks(indicator?: Indicator): RowMarks | undefined {
  if (!indicator) return undefined;
  return {
    failure: indicator.failure,
    unread: indicator.unread,
    running: indicator.busy?.length,
  };
}

export function childMarks(
  child: Child,
  busy?: number[],
): RowMarks | undefined {
  if (busy?.includes(child.conversationId)) return { running: 1 };
  const failure = failedRun(child.failure, false);
  return failure === undefined ? undefined : { failure: `Failed: ${failure}` };
}

export type ReadMarks = {
  answers: Readonly<Record<string, number>>;
  reads: Readonly<Record<string, number>>;
};

// Also used by named child rows: a busy conversation supersedes its last run.
export function failedRun(failure: RunFailure | undefined, busy: boolean) {
  const run = runState(failure, busy, undefined);
  return run.kind === "failed"
    ? (run.detail ?? failureWords(run.reason))
    : undefined;
}

const failedLabel: Record<Operation["kind"], string> = {
  relocate: "Move failed",
  clone: "Clone failed",
  fork: "Fork failed",
  archive: "Archive failed",
};

export function projectSidebar(
  rows: readonly { id: string; main: number }[],
  statuses?: Readonly<Record<string, Status>>,
  operations?: readonly Operation[],
  marks?: ReadMarks,
) {
  const operationIds = new Set<string>();
  const failedOps = new Map<string, string>();
  for (const op of operations ?? []) {
    operationIds.add(op.session);
    // Native operationOf: the FIRST failed source job wins over running jobs.
    // A target only shows the copying phase, never the source job's failure.
    if (op.phase === "failed" && !failedOps.has(op.session))
      failedOps.set(op.session, `${failedLabel[op.kind]}: ${op.error}`);
    if (op.phase === "running" && op.copying && op.target)
      operationIds.add(op.target);
  }
  const indicators: Record<string, Indicator> = Object.create(null);
  const activeIds: string[] = [];
  for (const { id, main } of rows) {
    const status = statuses?.[id];
    const busy = status?.busy;
    const detail = failedRun(status?.failure, busy?.includes(main) ?? false);
    const failure =
      status?.error !== undefined
        ? `Worker failed: ${status.error}`
        : (failedOps.get(id) ??
          (detail !== undefined ? `Failed: ${detail}` : undefined));
    const unread = (marks?.answers[id] ?? 0) > (marks?.reads[id] ?? 0);
    if (failure !== undefined || unread || busy?.length) {
      indicators[id] = {
        ...(failure !== undefined && { failure }),
        ...(unread && { unread }),
        ...(busy?.length && { busy }),
      };
    }
    if (indicators[id] || operationIds.has(id)) activeIds.push(id);
  }
  return { activeIds, indicators };
}
