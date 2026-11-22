# Goal mode

**Control.** The owner starts and steers a goal from the web UI. Open the command menu (Cmd/Ctrl+K), pick **Goal**, and the Goal sheet shows the objective, state, step progress and latest evidence. It has an objective field with a step limit (1–12) and **Start**, plus **Pause** while a goal runs and **Resume** while it is paused with its step settled. Starting again while no step is running replaces the previous goal; there is no separate clear. While a goal is running or paused, a chip with its step count appears in the session’s top bar and opens the sheet. The terminal UI’s `/goal` command was [removed](../../../docs/pi-removed-features.md#terminal-ui). The contract has no change feed, so the sheet polls `status` every 2 seconds and the chip every 5 seconds. The sheet and chip are `plugins/goal/web.tsx`.

The `goal` plugin serves the owner’s `Goal` contract (`plugins/goal/contract.ts`) for the main conversation of a private, unarchived, unlocked session:

- `status` returns the objective, step count, and latest evidence.
- `pause` prevents another step from starting. Use ordinary Stop to interrupt a step already admitted.
- `resume` continues a paused goal after its pending step settles, in the original main conversation.
- `start` takes an objective and a step limit, and replaces the previous goal once it is no longer active and its last step has settled.

A goal runs one ordinary model turn at a time, up to the chosen limit of 1–12 turns. This limit does not cap time, tokens, or tool calls within a turn. Admission pauses if the conversation is busy, has queued work, or changed since the goal last checked it. There is no global setting.

**Privacy at admission.** The session must be private, unarchived, and unlocked when each step is admitted. Sharing, locking, and archiving may proceed after admission; they prevent further steps while the session is ineligible. Goal inputs and answers are ordinary transcript entries. Anyone granted access later can see them.

**Restart.** The worker saves each submission receipt with the goal in the same transaction. Already-admitted work can recover through normal p2 recovery. New steps require explicit resume after a worker restart.

**Results.** `reported-complete` is the model’s claim, not verified success. Inspect the answer and evidence in the transcript. A blocker, missing report, or exhausted step budget stops the goal.
