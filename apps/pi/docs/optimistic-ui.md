# Optimistic UI in p2

Every action whose effect the user waits to see shows that effect at once: the switch flips, the row is renamed, the
message is in the transcript. This page is the pattern p2's plugins follow, on the web, and the
reference for plugin authors.

## Why it works without flicker

Two rules make an optimistic value safe to drop the moment its call settles:

1. **A method that should feel instant awaits its own effects** and keeps them on the host that answers (Chord's
   guide; decision "App authoring rules confirmed by the p2 audit"). `Sessions.rename` commits the catalog before it
   returns; `ChatMode.set` returns once the followed Durable document changed.
2. **A call's answer follows its state** (Chord decision of 2026-11-05): before a host sends a `result`, it sends the
   page the `state` it committed. When the call resolves on the page, the new value is already there.

So the page shows a guess while the call is in flight and simply forgets it when the call settles: on success the
real value has replaced it in the same frame; on failure the real value is the old one, so the guess rolls back by
itself, and the error is shown. Nothing on the page reconciles a guess with the server's value, compares ids or
waits for state after an answer.

A method that returns before its effect (a background job, a native that reports later) breaks rule 1: its guess
would vanish before the real value arrives. Such work shows a **pending state** instead (below), never a guess of
its outcome.

## Web: `useOptimisticCall`

`useOptimisticCall(value, apply, onError)` (`src/runtime/web.tsx`, from `@p2/app/v1/web`) is React's
`useOptimistic` plus a transition: it returns `[shown, run, pending]`.

```tsx
// a composer chip (chat mode was removed; the pattern stays)
const { fail } = useComposerState(); // the app's toast
const [{ enabled, name }, guess] = useOptimisticCall<Shown, Partial<Shown>>(
	{ enabled: useReadable(mode?.enabled) ?? false, name: useReadable(mode?.name) ?? DEFAULT_AGENT_NAME },
	(shown, change) => ({ ...shown, ...change }),
	fail,
);
// ...
<button onClick={() => guess({ enabled: !enabled }, () => mode.set({ enabled: !enabled }, BACKGROUND_CONTEXT))}>
```

- `value` is what the reference's state says now (`useReadable`); `apply(value, guess)` is a pure reducer. Guesses
  in flight are applied over the current value in order, so a state change arriving meanwhile is not hidden.
- `run(guess, call)` shows the guess at once and keeps it until `call()` settles. Its errors go to `onError`
  (usually `useComposerState().fail`, the app's toast; a sheet with its own error line passes its setter).
- `pending` is true while a call of this component is in flight: the label of a button doing long work.
- The guess lives in the component that shows the value. When the value shows in several places, put the actions
  where the value is rendered: the Session sheet is rendered by the sidebar (`plugins/sessions/web.tsx`), which owns
  the rows, so a rename, pin, archive or restore changes the list at once. Other views (the top bar's title) show the
  state that arrives with the answer.

Reducers in p2 to copy from: a list edit by id (`applyRow` in sessions), save/delete (`applyEnv` in `plugins/envs/EnvsPanel.tsx`), a replaced value (the
model choice in `plugins/chat/web.tsx`, the provider login state in `plugins/login/web.tsx`).

## What has no guess: server-made values and long work

- **Client-chosen ids** make creation instant. Send on the new-session screen shows the message at once
  (`plugins/chat/session-start.ts`); the page chooses the session's ID (`Sessions.create({ id })`), so a creation
  retried after a lost answer answers the same session, and holds the new session's main conversation while `create`
  runs, so its worker starts beside the creation, not after it. The messages then move to that conversation's outbox
  and the session opens; a refused creation puts them back into the composer. A sidebar folder's "+" opens the same
  screen in that folder. Each message has its own `requestId`.
- **Server-made ids** are not guessed (`ProviderLogin.start`: the attempt): the page shows a pending screen, the login sheet's spinner until the provider's
  first prompt arrives.
- **Long work** is a job on the server; the page shows that it runs and how it ended, never a guessed result.
  Session lifecycle operations (`Sessions.operations`: a move, a clone, a fork, an archive) mark their row in the
  sidebar ("Moving…", "Copying files…"); a failed one stays on its row with its error
  and Dismiss (`dismissOperation`), and the top bar says "Moving…" from the tap
  until the move is done (a move the busy worker refused shows in the toast too). Retry shows "Retrying…" until the
  worker runs, or its error; "Rebuild search index" (`Search.rebuilds`, `/reindex`) shows it running until done or
  failed; "Save and test" shows "Working…"; `/compact` shows the compaction indicator at once.
- **Sending** is optimistic: the web's outbox (`plugins/chat/outbox.ts`) shows
  the message at once (in the queue while a run is busy, in the pending area while the conversation connects) and
  clear the editor; a refused one comes back to the editor with its error. A retry after a lost answer reuses the
  request ID, so it is admitted once.

## Load: no waterfalls

The same instinct applies to loading: hold what a view needs in parallel, from values the page already has.

- **Cached owner flag:** `useOwner()` remembers whether this browser is the owner across starts; `useCanWrite(session)`
  adds a guest's grant. Views that are the owner's (unread marks, search, models) hold
  at once instead of after `Access` is live.
- **Holds with the view:** `SubagentControl`, `Drafts` and the file index hold when the view opens (who may write is
  known), not after `Chat` is live or the subagent list names the child; `/tree` holds one `SessionTree` per session
  for all its actions.
- **Short links:** `/s/<id>` opens the session's main conversation as this device last saw it (`knownMain`), so the
  page holds the right conversation first instead of conversation 1 and a redirect.

## Tests

- `test/p2/ui-optimistic.test.ts` (fixture `test/fixtures/optimistic.ts`): in Chromium, the guess and the pending
  state while a call is held open, the server's value after it passes, the rollback and the error after a refusal.
- `ui-drawer.test.ts` (a new session shows its first message and attachment at once), `ui-sidebar.test.ts` (the
  new-session screen's location and opening a session from the sidebar),
  `session-start.test.ts` (one ID across retries).
