# One-shot conversation wakes

`wake_at({ at, text })` saves a future follow-up for the calling conversation.
Use an ISO timestamp with an explicit offset, for example
`2030-06-01T09:00:00-04:00`. The saved instant is UTC. Text is limited to
32,768 characters, matching the external-input convention.

`wake_list()` lists the session's saved records. `wake_cancel({ id })` stops
future admission attempts. Tools follow normal tool selection and are unavailable
when locked. Registration requires a private, unarchived session.

The server waits without holding an idle worker or running a model. After downtime,
an overdue wake is delivered once. Delivery always uses the saved conversation;
changing the main branch never redirects it. Existing read-only conversation rules
can block admission. Session archive or sharing blocks new dispatch; restoring the
session does not rearm a blocked wake.

Input is attributed to an external “Scheduled wake”, not the owner. It enters the
existing native follow-up queue. `admitted` means native input was accepted, not that
its requested business action succeeded. The server follows the native submission
until `done` or `unanswered`, including user-aborted work, before admitting another
wake for that target. Other sessions progress independently.

Cancellation cannot undo admitted input. If an admission reply is lost, cancellation
leaves an `uncertain`, `readback-only` obligation. Missing readback is not proof that
a late commit cannot happen. A recovered receipt remains visible and is followed to
native settlement. Archive skips worker acquisition; unresolved outcomes are read
back after restore without rearming admission. Cancellation and worker admission
are separate transactions, so an in-flight admission may win the race.

Records and receipts persist across restarts and are not automatically pruned.
There is no recurrence, expiry, arbitrary scheduling horizon, or new queue quota.
Legacy Hermes HTTP authentication, request identity and receipt formats are unchanged.

Source implementation does not imply live rollout. Applying this plugin requires
separate owner approval; no runtime or configuration migration is required.
