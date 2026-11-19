# Goal mode

In the owner’s TUI, open the main conversation of a private, unarchived, unlocked session. For example:

```text
/goal start 4 Compare the desktop and mobile settings pages, fix layout differences, and report screenshots and tests.
```

- `/goal` or `/goal status` shows the objective, step count, and latest evidence.
- `/goal pause` prevents another step from starting. Use ordinary Stop to interrupt a step already admitted.
- `/goal resume` continues a paused goal after its pending step settles. Return to the original main conversation first if you switched branches.
- `/goal start <steps> <objective>` replaces the previous goal once it is no longer active and its last step has settled.

A goal runs one ordinary model turn at a time, up to the chosen limit of 1–12 turns. This limit does not cap time, tokens, or tool calls within a turn. Admission pauses if the conversation is busy, has queued work, or changed since the goal last checked it. There is no web control or global setting.

**Privacy at admission.** The session must be private, unarchived, and unlocked when each step is admitted. Sharing, locking, and archiving may proceed after admission; they prevent further steps while the session is ineligible. Goal inputs and answers are ordinary transcript entries. Anyone granted access later can see them.

**Restart.** The worker saves each submission receipt with the goal in the same transaction. Already-admitted work can recover through normal p2 recovery. New steps require explicit resume after a worker restart.

**Results.** `reported-complete` is the model’s claim, not verified success. Inspect the answer and evidence in the transcript. A blocker, missing report, or exhausted step budget stops the goal.
