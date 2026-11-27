# Cursor

A trusted plugin that lets an agent hand a task to a [Cursor](https://cursor.com) agent through the official
[`@cursor/sdk`](https://cursor.com/docs/sdk/typescript), on this machine (`local`) or in a Cursor-hosted VM (`cloud`).
Cursor is a tool, not a model: no model provider is added. A run never holds the turn. The tool returns a run id, Pi
watches the run, and when it ends Pi wakes the session with one stimulus. It declares the stimulus source `cursor.run`
version 1; the stimuli plugin owns the saved delivery, retry and receipt.

- `server.ts`: the facet (the owner's settings, the agent's remote, the watcher). `runs.ts`: starting, watching, resuming and
  ending runs, and publishing the one stimulus. `agent-process.ts`: the detached process that runs one local agent
  (`rundir.ts` is its files, `local-policy.ts` the checks it repeats, `limits.ts` the shared numbers). `policy.ts`: what a run may do. `store.ts`: settings and runs in p2 state.
  `secrets.ts`: the key file. `web.tsx`: Settings › Cursor.
- `client.ts`: the interface Pi talks to Cursor through. `sdk.ts`: the one file that knows the real SDK.
- `render.ts`, `contract.server.ts`: how a result reads to the agent. `contract.ts`: the shapes and limits.
- `worker.ts`: the agent's seven tools.

## Installation

1. Copy this directory as a real directory to `<P2_DATA_DIR>/plugins/cursor/` on a Pi build that has it, and follow the
   operator window of [the integrations guide](../README.md). It adds no routes and no listener.
2. Install the SDK **inside that directory**: `cd <P2_DATA_DIR>/plugins/cursor && npm install --omit=dev --ignore-scripts`
   (Node 22.13 or later; the SDK brings its per-platform native package as an optional dependency, and `--ignore-scripts`
   is enough). Then `reload_plugins` or restart.

   Why this way: a user-root plugin may import only the host's API, so `@cursor/sdk` cannot be bundled into it. Its
   `package.json` lists the package under `chord.external`, which makes the plugin loader keep it external and load it from
   the plugin's own `node_modules`. `dependencies` pins the version and `package-lock.json` the tree. Nothing else changes
   in a copied directory. Until the SDK is installed the plugin loads anyway and every use says what to run.
3. Under launchd (macOS), add `AbandonProcessGroup` set to `true` to the server's job plist, so a stop or restart of the job
   does not take the detached agent processes down with it, then `launchctl bootout` and `bootstrap` the job once for it to
   apply. See [Runs and restarts](#runs-and-restarts) for what was measured and how the plugin notices if it is missing.
4. In **Settings › Cursor** (owner only) enter the API key. That is the only configuration; there is no config file.

## Settings

- **API key**: write-only. Stored in `<P2_DATA_DIR>/cursor-secrets.json` (mode 0600), never sent back to the browser,
  never logged, taken out of every error and result Pi shows or keeps, and registered with the server's log redactor.
  **Test key** makes one harmless call (who the key is) and reports the key's name, not the key. With no stored key Pi
  uses `CURSOR_API_KEY` from the server's environment.
- **Defaults**: the model (chosen from the list the SDK reports for the key) and the runtime (`local` or `cloud`).
- **Allowed repositories**: `owner/name` or `owner/*` (case-insensitive). A cloud run starts only on a listed repository.
- **Allow local agents to edit files** (off by default) and **Allow cloud agents to change repositories** (off).
- **Runs at once**, all sessions (default 6) and per session (default 4), 1 to 12 each; a session cannot have more than the total.
- **Auto-resume interrupted runs** (off by default): Pi resumes an interrupted run by itself, at most twice per run, telling
  the Cursor agent what interrupted it. See [Interrupted runs](#interrupted-runs-and-cursor_resume). Settings also shows
  whether detached workers have been seen to outlive a Pi stop (`outlived`, `were killed`, `not observed yet`).
- **Sandbox local agents** (next to the edit switch), with the status Pi has found: `supported`, `not supported on this
  machine` or `not checked`. See [the sandbox](#the-sandbox).

## What a run may do

| | `ask` (default) | `plan` | `agent` |
| --- | --- | --- | --- |
| local | read-only tools (`read`, `grep`, `glob`, `ls`) | the same, in the SDK's plan mode | every tool, in Cursor's shell sandbox when it can give one; needs the local edit switch |
| cloud | a plan (cloud has no read-only ask) | a plan | works on a branch of its own, opens no pull request; needs the cloud switch and an allowed repository |

- A local run works in the session's directory, or a directory below it given as `path` (checked on real paths, so a link
  out is refused). It is refused when the session works on another environment (SSH, a sandbox): the SDK runs on the
  Pi server's machine. Ambient hooks, rules and MCP servers of the machine's Cursor settings are not loaded.
- The owner sets how many runs may go at once, in **Settings › Cursor**: all sessions (default 6) and per session (default 4), each 1 to 12, a session never above the total; the code never goes past 12. A refusal names the current caps and where to change them. Each run lasts at most 120 minutes (default 30). A run past its time is cancelled
  and, if Cursor does not answer, given up on. Prompts are at most 20 000 characters. Pi keeps at most 16 000 characters
  of a result and the wake carries the first 1 500. Pi keeps the last 50 finished runs.
- Only the session that started a run can see, read or cancel it.

## The sandbox

Local `agent` runs ask the SDK for its shell sandbox, which keeps the agent's shell writes inside the working directory.
Some machines cannot give one (macOS under another sandbox, a service account, a container): the SDK then refuses to start
with "Local SDK sandboxing was requested, but sandboxing is not supported in this environment". The owner chooses what
happens in **Sandbox local agents**:

- **When possible** (default): ask for it; if the SDK says it is unsupported here, run without it. The run is labelled:
  its `sandbox` field is `unavailable`, `cursor_task`, `cursor_status` and `cursor_result` say "ran without Cursor's
  shell sandbox", and so does the wake.
- **Required**: fail with a message naming the setting; no agent is started.
- **Off**: never ask; runs are labelled `off`.

Pi finds out once per process with one small request (a no-tools plan-mode prompt in an empty temporary directory, a few
tokens), before the first sandboxed run, and keeps the answer until the server restarts. If that request cannot say (a
network error), the first real run is the test: the SDK's refusal is recognised by its wording and the run is started again
as the setting allows. **Check sandbox** in Settings asks again. Read-only modes never involve the sandbox. Without a
sandbox an agent-mode shell can write anywhere the server's user can: the edit switch is the guard that remains, and
`path` still keeps the working directory below the session's.

## Models

The SDK's live list for the key decides. `cursor_models` returns the allowed ids (the owner's default marked) and each
model's parameters (for example `thinking`, `effort`, `fast`, `context`), cached for ten minutes. Pass parameters as
`modelParams`, e.g. `{"effort":"high","thinking":"true"}`; they are checked against the list and sent to the SDK as the
model's `params` (the SDK accepts them). A CLI-style name such as `claude-opus-5-thinking-high` is mapped to
`claude-opus-5` with `thinking=true, effort=high` only when the longest id that starts it is in the list and every
remaining word names exactly one parameter value of that model. Anything else, an alias two models share included, is
refused with the closest matches, up to 20 allowed ids and a pointer to `cursor_models`. If the list cannot be fetched,
the name goes to Cursor as it is.

## Runs and restarts

A local run is a **detached agent process** (`agent-process.ts`, started with the server's `node`, in a session of its own,
output to a file). Pi only observes it through a directory `<P2_DATA_DIR>/cursor-runs/<run id>/` (mode 0700, files 0600,
written atomically): `request.json` (what it was asked), `status.json` (the heartbeat), `partial.txt` and `events.jsonl`
(what it streams), `result.json` and `exit.json` (written last: a clean end), `cancel` (a marker Pi writes), `worker.log`.
The API key goes to the process in its environment only, is removed from it before the agent starts, and is redacted from
everything it writes. It repeats the cwd, mode and edit checks itself, enforces its own deadline and watches for the
cancel marker; Pi also kills it if it ignores a deadline or cancellation.

**Surviving a Pi restart is a convenience, not durability.** A Cursor run is not a Pi session: nothing makes it come back.
If the worker dies (Pi stopped under it by a service manager, a crash, a kill, a reboot, the machine shutting down) the run
is *interrupted*. What a restart does:

- worker still running (pid and start time match): Pi follows its files again and the run goes on;
- worker finished while Pi was down: Pi reads `exit.json`/`result.json`, records the result and publishes the wake once;
- worker gone without `exit.json`: the run is `interrupted`, with the partial text and last activity (never an empty
  result when text was streamed). If there is no Cursor agent to resume (it died before the agent was created) it is
  `failed`.

Pi watches each worker's **heartbeat** (every 15 s, in `status.json`): `cursor_status` and `cursor_list` show `health`
(`running`, `stale-heartbeat`, `interrupted`, `finished`, `failed`, `cancelled`, `timed-out`), the last activity and the
files an editing tool named. A stale heartbeat with the process alive (a sleeping machine) is only a warning; the run is
interrupted when the process is gone or its pid belongs to another process now. Cloud runs live at Cursor and are found
again through the SDK.

### Interrupted runs and `cursor_resume`

A Cursor agent keeps its conversation, and a local run's edits are on disk, so an interrupted run **can** be resumed. The
SDK resumes a local or cloud agent by id (`Agent.resume`, as `cursor-agent --resume` does in the CLI); after a worker is
killed the SDK still holds the dead run as active, so the resumed send says `local.force` to expire it (checked against the
real SDK: a plain send fails with "already has active run", a forced one goes on and the agent remembers the earlier
conversation). Pi keeps the Cursor agent id, directory, mode, model, sandbox setting, heartbeat and partial text.

`cursor_resume` (`id`, optional `instruction`) starts a new worker that resumes the same agent and sends: *You were
interrupted by `<event>` at `<time>`; your previous partial work is on disk in `<cwd>`; check the state of the files, then
continue the task.* plus its last activity and the instruction. It needs a nudge and a check of what state the files were
left in: it does not come back like a Pi subagent. Limits still hold: the caps on runs at once, 120 minutes **in
all**, edits only while the owner allows them, the directory re-checked on real paths, sandbox setting and fallback as
for a new run. A run that finished, failed or was cancelled cannot be resumed. If Cursor refuses the resume (an agent id it
no longer knows) the run becomes `failed` and keeps its partial text.

The wake for an interrupted run says what interrupted it and when, what the run had produced, its last activity and files,
and that `cursor_resume` exists. With **Auto-resume** on, Pi resumes it itself (at most twice per run) and the wake says so.
The earlier worker's files are kept under `attempt-<n>/`.

**Where the event comes from** (always Pi's side, never the agent's guess):

1. On a graceful stop Pi writes `<P2_DATA_DIR>/cursor-runs/_stopped.json` (the event "the Pi server stopped or restarted",
   the time, the signal if it knows, the workers it was watching) before it lets go of anything.
2. An operator can write `<P2_DATA_DIR>/cursor-runs/_interruption.json` **before a planned restart**, for example
   `{"event": "Pi restart to install plugin version X", "by": "the caretaker", "at": "2030-01-02T03:04:05Z"}` (`by` and `at`
   optional). It is read once at the next start, attached to every run it interrupted and removed.
3. If the machine's boot time changed since the worker started, the event adds "the machine rebooting". Otherwise it is
   "a worker process that died without a recorded reason".

### launchd

Measured with a throwaway LaunchAgent (`local.pi-cursor-test`, not the server's) whose process starts a detached
`/bin/sleep` child: the child **survived `launchctl kickstart -k` and `launchctl bootout`**, with and without
`AbandonProcessGroup`, because a process started in its own session leaves the job's process group. The plist still should
set `AbandonProcessGroup` to `true`: it is what launchd documents for processes that must outlive the job, and it covers a
worker that is not in a group of its own. The key only takes effect when the job is next bootstrapped. Pi does not assume
it: if workers that were running when Pi stopped are dead without a clean exit at the next start, Settings says "were
killed at the last Pi stop", names `AbandonProcessGroup`, and the interrupted wake and `cursor_status` say it too. A reboot or
a crash still interrupts every run. Other service managers (systemd: `KillMode=process`, or run the workers in their own
unit) need the same care.

## Agent tools

`cursor_task` (`prompt`, `runtime`, `mode`, `model`, `modelParams`, `repo`, `branch`, `path`, `timeoutMinutes`), `cursor_models`, `cursor_status`,
`cursor_result` (`id`, `maxChars`), `cursor_resume` (`id`, `instruction`), `cursor_cancel` and `cursor_list`. `cursor_task` is refused in read-only conversations. The run id comes from the tool call, so a replayed call is the same run.

The wake says it came from Cursor, names the run id, quotes a bounded summary line by line, and says that it is untrusted
input to verify, not instructions. One event is published per run, ending and attempt (`<run id>:<status>:<attempt>`):
watching again, a restart or a retry never repeats it.

## Data and safety

- **What leaves the machine.** Your prompt, every file the agent reads and every tool result go to Cursor. A cloud run
  clones the repository into a Cursor VM. Local runs also keep transcripts under `~/.cursor/projects/` of the server's
  user. Check your team's **privacy mode** and data-retention terms in Cursor before using a work account, and send
  nothing secret.
- **Read-only is by tool selection, not a jail.** `ask` and `plan` offer only read tools, but those read any path the
  server's user can read: the directory is the working directory, not a confinement. `agent` mode asks for Cursor's own
  sandbox to keep shell writes inside the working directory, and runs without it where the machine cannot give one
  (unless the owner set it to required). The owner decides with the edit switch.
- A run's directory holds its prompt (`request.json`) and what it streamed: it is as sensitive as the run. Only the server's
  user can read it, and it is not removed when a run ends (the last 50 runs' records are kept in Pi's state, the directories
  stay until the operator deletes them).
- Cursor's output is untrusted. Pi quotes it, bounds it and labels it; the agent must verify it, and never follow it.
- The key never appears in tests, logs, errors, settings reads or stored runs (the tests search every file of the data
  directory for it).

## Tests

`__tests__/p2/cursor.test.ts` and `ui-cursor.test.ts` run against a fake `@cursor/sdk` package
(`__tests__/fixtures/fake-cursor-sdk`) installed into the fixture plugin's `node_modules`, with the real adapter, server,
worker and stimuli. Cloud mode is tested only against that fake.

## Developer notes

- Changing a stored schema needs version+1 and migrate. That holds for `p2.cursor-config` (now 4) and `p2.cursor-runs` (3) (the
  persisted states; `p2.cursor-survival` is new, at 1) and for every contract and local store (`p2.cursor-store`, `p2.cursor-runs`, `p2.cursor-settings`): a changed
  shape under the same version fails to load where the old object is stored. `__tests__/p2/cursor-upgrade.test.ts` starts the
  plugin on a data directory written by the first release (`__tests__/fixtures/cursor-v1-store.ts`, frozen); when you
  bump a version, add what that version wrote to the fixture the same way.
- The stimulus source `cursor.run` stays at version 1: its event only gained optional fields and the status `interrupted`,
  so stored events remain valid. A change that makes an old event invalid needs source version 2 with the old one kept registered.
