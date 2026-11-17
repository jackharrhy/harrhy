# Automatic Rex TUI tabs

The optional `rex` server plugin represents each unarchived p2 session with one background Rex tab containing its TUI. It includes existing/imported sessions and newly created sessions, including the Familiar. Subagents, one-shot agents and conversation branches do not get separate tabs. A TUI opens the session's current main conversation; it can navigate normally afterward.

This attaches to the existing Durable session. It never launches a second Pi agent, creates another p2 session or submits a prompt. Attaching can start its existing worker and resume work already committed there.

## Enable

Requirements: a same-user local Rex Unix server and its supported `rex` CLI, an existing Rex session, and Node 26.5.1 or newer for the TUI. No Rex TypeScript package, raw socket protocol or Lua configuration is needed.

Inspect the target without changing it:

```sh
rex whoami --json
rex ls --json
rex session inspect <full-session-id> --json
```

Create `<P2_DATA_DIR>/rex.json` as a same-user regular file with mode `0600`:

```json
{
  "endpoint": "unix:///run/user/1000/rex/server.sock",
  "hostId": "<host_id from whoami>",
  "sessionId": "session:<existing fallback Rex session UUID>",
  "projects": {
    "softspark": "session:<existing Softspark Rex session UUID>",
    "rea": "session:<existing REA Rex session UUID>"
  }
}
```

The example endpoint is illustrative: use the endpoint that `whoami` actually reports. `binary` can optionally name an absolute Rex executable instead of finding `rex` on PATH. The configuration is private machine data, not a portable repository patch. It is read again within about 30 seconds; it is not a `settings.json` setting.

`projects` is optional: exact native p2 project names map to fixed, existing Rex session IDs. Unassigned sessions and
projects without a mapping use `sessionId`. Membership comes from p2's project service, never a folder or title.
Rex sessions contain windows (tabs), layers and blocks; there is no supported tab-folder hierarchy in the inspected
CLI. Create empty target sessions once with `rex api call session.create '{"label":"rea"}'` and pin the returned
IDs. Creating targets is an explicit owner operation, not automatic plugin behavior. The plugin never deletes a
whole Rex session, including an empty project target. Missing targets are reported independently; healthy targets
continue reconciling, without silently falling back or creating replacements.

The plugin verifies the endpoint, same-user Unix peer, host ID and required CLI API capabilities before acting. It never autostarts Rex or creates a replacement Rex session. Invalid configuration, unavailable Rex and a missing target are reported through p2's routine error/retry mechanism without blocking session creation, archive or restore. Removing `rex.json` disables further management; it does not close existing TUI panes.

## Ownership and lifecycle

- Tabs open without taking focus. Existing tabs and unmanaged panes are left alone.
- Tab and pane labels match the p2 session title, without UUIDs. Ownership never depends on visible names. Title changes update managed labels; a moved pane does not cause its new, unrelated tab to be renamed.
- `<P2_DATA_DIR>/rex-state.json` holds exact Rex IDs, pending launch nonces and manual-close suppression. Private atomic receipts in `<P2_DATA_DIR>/rex-receipts/` bind each nonce to the configured host/endpoint and Rex's supplied `REX_SESSION`/`REX_BLOCK`. Keep these files with the data directory; do not delete them to troubleshoot while managed panes still exist. Rex's installed CLI documentation and the disposable integration test verify those environment IDs; the integration does not require `REX_SERVER`, which is absent in some versions.
- Creation is serialized across all targets and limited to one new pane per pass, at most one pass per second.
  One enabled-only Rex event stream per target, catalog changes and project membership changes wake reconciliation;
  a roughly 30-second fallback also catches missed events and configuration edits.
- Existing open, uncertain (`pending`) and manually closed (`suppressed`) mappings are sticky at their original
  target, even after a project/configuration change. The plugin records `relocationNeeded` and reports a newly
  detected routing mismatch through routine diagnostics; it never duplicates or automatically moves that viewer.
  Manual-close suppression survives project changes. Archive/restore rearms at the current project target.
- Archiving or removing a p2 session closes only its known managed block. Restoring it rearms representation. Closing a managed pane manually does not stop/archive its agent, and the plugin leaves it closed until an archive/restore cycle. Detaching it also suppresses replacement.
- Before launching a TUI, a small Rex-owned wrapper atomically records its private receipt, then starts the ordinary TUI. A lost creation reply is adopted only through a matching nonce, configured host/target and live exact block ID. Duplicate/stale claims are refused; names are never searched for adoption. If the outcome remains uncertain and no receipt/live block appears, creation is not blindly retried. Inspect Rex first; after establishing the old request is no longer in flight, an archive/restore cycle can rearm that session. Do not repeatedly reset state or retry creation on a timeout.
- A p2 restart or TUI bundle replacement preserves existing panes and connections reconnect. A **Rex server restart** is different: Rex can restore a layout without restoring the TUI process. This integration does not type into restored shells, replace exited programs or automatically resurrect them. Reattach explicitly after inspecting the pane; automatic process resurrection is outside this initial scope.

## Explicit project relocation

The inspected Rex API cannot move windows or blocks across sessions; within-session moves are not transfers.
Regrouping an existing viewer therefore replaces its TUI process/window/block, not its p2 agent, history or work.
Do not archive/restore the actual p2 session merely to move its viewer, and never rewrite a launch receipt.

For an authorized bounded relocation:

1. Record the exact source target, acknowledged managed block, mapping and unrelated pane/focus inventory privately.
   Disable management by moving `rex.json` aside, then reload only the rex plugin to drain the previous routine before
   changing its state. Confirm no mirror event streams remain. Do not stop Rex or the p2 agent workers.
2. Create/verify and pin the fixed destination IDs. With reconciliation stopped, mark only the selected **open,
   acknowledged** mappings `phase: "relocating"`, with `destination` set to the exact desired target. Keep their
   old block/window/nonce fields. Never convert suppressed or uncertain pending mappings into relocation intents.
3. Restore the private configuration with its project map. The plugin verifies destination availability, closes only
   the old exact block, and persists `archived` with the old IDs cleared. Only a later routing pass can launch in the
   new target, with a fresh nonce and receipt. A lost close reply retries against the old exact ID, never a title.
   A missing destination leaves the old viewer intact; a changed intended route refuses relocation.
4. Verify the old managed block is absent, exactly one new viewer exists, its receipt names the new target, and
   unassigned/unmanaged panes and backend sessions are unchanged. Retain the superseded receipt as evidence.
   After a crash, inspect the persisted intent/old exact block before resuming; never reset a pending launch to retry.

There is no automatic whole-session lifecycle or viewer resurrection after a Rex server restart. A project target
removed from configuration remains managed while sticky mappings still own it. Once archived, those viewers rearm
using current routing. Target labels are presentation only and never used for adoption.

## Resources and authority

An attached TUI holds its session worker live even when no model is answering, including in an unfocused Rex tab. Each new tab adds a receipt-wrapper Node process, the TUI Node launcher and its sandbox worker thread, terminal state, a Chord connection and bundle checks. The existing session worker and its active resources remain resident instead of idle-unloading. There is no focus-based lazy suspension or historical-session cap; Rex's own tab/process limits still apply.

Viewing is not a model request. Existing agent work and background policies still apply: cache warming can make billed refresh requests after a response according to its configured policy. Opening a TUI is not a way to stop or disable those policies.

Every person able to use these panes receives the local owner's p2 TUI authority. Trust Rex's access controls accordingly. Authentication uses p2's local-owner challenge and private data directory; keys, cookies and owner links are never placed in command arguments or labels. Launches are argv-only, without shell interpolation. The TUI runs on the p2 host even for sessions working in SSH environments or sandboxes; p2 retains execution routing and access policy. Rex remote hosts are not supported by this integration.

## Verification

Focused tests from `apps/p2`:

```sh
node --import ./src/source.ts --test test/p2/rex-cli.test.ts test/p2/rex-config.test.ts test/p2/rex-receipt.test.ts test/p2/rex-reconcile.test.ts test/p2/rex-routing.test.ts test/p2/tui-target.test.ts
node --import ./src/source.ts --test test/p2/rex-integration.test.ts
```

The integration test starts its own Rex with a temporary Unix socket, empty Lua configuration and private state, plus a fake-provider p2. It never uses the owner's Rex session. It verifies existing-session attachment, backfill, archive/restore, manual close, unmanaged-pane preservation and no new p2 sessions. It skips when `rex` is unavailable. TUI tests require Node 26; browser coverage is separate.

`npm run tui -- --session <p2-session-id>` is also available independently of Rex. It requires owner sign-in and rejects missing/archived targets. Without `--session`, the existing session picker is unchanged.
