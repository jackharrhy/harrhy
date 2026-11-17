# Recurring prompts

The `schedules` plugin turns a named cron expression into durable external inputs through the existing stimuli source API. It does not run shell commands, start a polling agent, or claim that the requested work succeeded. No model runs while waiting.

## Create and manage

Conversation tools are available in code mode under `schedules`:

```ts
await tools.schedule_create({
  id: "daily-research",
  title: "Daily public research",
  cron: "0 8 * * *",
  timezone: "America/St_Johns",
  text: "Review substantive public findings since the last report and summarize sources.",
});
await tools.schedule_list({});
```

The exact target is the calling conversation in its authenticated session. IDs are instance-wide; choose a distinct ID for each job. Creating the same ID with identical intent returns its existing row, not a second job. A different definition or target conflicts. A schedule requires a private, unarchived session and an existing writable conversation.

- `schedule_list`: definitions, exact targets, revision, active/paused phase, next UTC/local time, pending publication, last occurrence and error.
- `schedule_set_enabled({id, expectedRevision, enabled})`: pause/resume using the current revision. Pause retires unattempted deliveries; it cannot undo native admission. Resume creates a fresh subscription and starts strictly in the future; no paused-period catch-up.
- `schedule_update({definition, expectedRevision})`: replace the definition and target the calling conversation. Retires the old subscription, then creates a fresh binding and future cursor. An unsuccessful replacement can leave the old job paused; inspect the list before retrying with its current revision.
- `schedule_run({id, expectedRevision})`: one manual publication of an active schedule. Does not move the recurring cursor. A retry of the same tool call reuses its event identity and captured revision; after pause/resume or update, an old retry rejects rather than publishing under the new binding. A new tool call intentionally requests a new manual run.
- `schedule_receipt({id})`: latest pending/last occurrence's actual stimuli readback. `recorded`, `unknown`, `admitted` and native settlement retain their existing meanings. None means the research, update or other business job succeeded.

The browser owner has equivalent explicit-target `Schedules` methods (`createTarget`, `updateTarget`, `setEnabled`, `list`, `run`, `receipt`) in `plugins/schedules/contract.ts`. Workers are self-session-scoped and generation-checked on every call. Guests cannot bind the interface. All schedule tools are unavailable in locked sessions. Tools do not accept another session's ID.

## Time and downtime

Cron accepts five fields (`minute hour day-of-month month weekday`) or six with seconds first. Numeric lists, ranges, steps and the pinned parser's deterministic named-field syntax are supported. Random `H`, `?`, and macro expressions are rejected. Use an explicit timezone accepted by the host's IANA timezone database, such as `America/St_Johns`, rather than assuming Newfoundland is a fixed UTC offset. Day-of-month/day-of-week use cron-parser's non-strict matching semantics.

The parser is pinned to `cron-parser@5.10.5` (Luxon `3.7.2` in the lockfile). The 08:00 Newfoundland job occurs at 11:30 UTC in winter and 10:30 UTC in summer. Missing/repeated wall-clock hours follow that parser's semantics; UTC instants, not formatted local labels, identify occurrences. A nonexistent 02:30 during Newfoundland spring-forward lands at 03:30. A repeated fall-back hour can be selected at its second UTC instant when calculating from inside the fold; do not use ambiguous transition-hour schedules when the business requirement is strictly once per local wall-clock label. 08:00 is unambiguous.

Creation and resume select a strictly future occurrence. While enabled, overdue recovery selects one latest due occurrence and moves to the next future one, rather than replaying every missed interval. A previously persisted pending occurrence takes precedence: it replays its original identity and bytes, then skips intervening missed occurrences. This is catch-up of the scheduler's cursor, not coalescing already recorded native obligations or waiting for the previous business job to finish.

## Persistence and failure boundaries

The server owns `p2.schedules`: definition, logical revision, bound subscription, future cursor and optional pending/last occurrence. The stimuli store remains the authority for subscriptions, immutable delivery and native reconciliation. The worker remains the sole authority for native input/receipt and settlement.

Each active revision has a deterministic, separate stimuli subscription, including a digest of its immutable definition and target. An orphan replacement cannot collide with resuming a different prior definition. The installed typed source `p2.recurring-prompt` renders the saved title/text and selected occurrence timestamp. Before publishing, the scheduler persists a pending occurrence (`scheduled:<UTC ISO>` or `manual:<request ID>`). Only after stimuli acknowledges durable recording does the scheduler checkpoint its cursor. Losing that acknowledgement or restarting between stores replays the same identity; it does not invent a new input.

Provisioning writes a subscription before the schedule row. A crash between them can leave an unused subscription, which publishes nothing; retry checks its exact source/target/configuration before reusing it. Pausing disables stimuli first. If the server dies before checkpointing the paused schedule, activation checks bindings even when the cursor is not yet due and pauses rather than re-enabling a retired binding. Retirement only disables the captured subscription revision, never an independently revised binding. Per-schedule queues serialize publication and management without making unrelated schedules wait on a stuck target.

Source/target validation failures leave the pending intent and an error visible; transient publication failures retry with backoff. Sharing/archive and existing input gates still restrict publication/admission. There are no new provider credentials, HTTP listeners, global admission deadlines, count quotas or business automation permissions.

## Verification

From `apps/p2`:

```sh
node --import ./src/source.ts --test test/p2/recurrence.test.ts test/p2/schedules.test.ts test/p2/schedules-recovery.test.ts test/p2/schedules-provision.test.ts test/p2/schedules-mutations.test.ts test/p2/schedules-tools.test.ts
```

The tests cover Newfoundland offsets, both DST season changes and reconstruction between repeated hours; cron boundary/missed-run selection; real manual duplicate publication and native provenance; recurring native input; pause/resume/revision isolation; guest/stale-worker/cross-session denial; sharing eligibility; actual store reopen; persisted crash images at the publication/cursor checkpoint boundary with exactly one native pending replay plus one backlog catch-up; orphan provisioning eligibility; queued worker operations after owner retargeting; actual manual publication failures before recording and after a lost recording acknowledgement; stale manual retries after replacement; future-only activation after blocked provisioning; abandoning orphan replacement intent; immediate future-cursor binding recovery; and actual locked-session code-mode refusals.

The pure cron parser is a host package, so installing this plugin initially requires the updated server runtime, not just a plugin reload. Later compatible schedule-plugin edits use the normal explicit plugin reload.
