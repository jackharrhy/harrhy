# Cursor delegation

`cursor_task` starts a detached Cursor run and returns its ID. Pi publishes a wake to the calling conversation when the run settles. New local runs use the signed-in Cursor CLI over ACP. Cloud runs and legacy SDK recovery still use `@cursor/sdk`.

## Install

1. Copy this whole `cursor` directory into `<P2_DATA_DIR>/plugins/cursor` as a real directory. Include `acp-runtime/`; the local worker needs those files directly and does not require the foreground ACP plugin.
2. For local runs, install a trusted Cursor CLI that supports `agent acp` and sign in outside Pi as the Pi server user. Create `local-acp.json` in the installed Cursor directory, readable by that user only, containing `{"command":"/absolute/path/to/agent"}`. Pi reads it when admitting each local run. The server startup environment `P2_CURSOR_ACP_COMMAND` is a fallback when the file is absent. Do not put credentials in the file. Detached ACP requires POSIX process groups.
3. For cloud or legacy SDK recovery, run `npm install --omit=dev --ignore-scripts` in that plugin directory, then set the API key in **Settings › Cursor**. The SDK is not needed for new local runs.
4. Under launchd (macOS), set `AbandonProcessGroup` to `true` and bootstrap the job again so detached workers can outlive Pi. See [Runs and restarts](#runs-and-restarts).

## Settings

- **API key**: write-only. Stored in `<P2_DATA_DIR>/cursor-secrets.json` (mode 0600), never sent back to the browser,
  never logged, taken out of every error and result Pi shows or keeps, and registered with the server's log redactor.
  **Test key** makes one harmless call (who the key is) and reports the key's name, not the key. With no stored key Pi
  uses `CURSOR_API_KEY` from the server's environment.
- **Defaults**: runtime (`local` or `cloud`) and an optional model. When blank, Cursor selects a default.
- **Allowed repositories**: `owner/name` or `owner/*` (case-insensitive). A cloud run starts only on a listed repository.
- **Allow local agents to edit files** and **Allow cloud agents to change repositories** are both off by default.
- **Runs at once**: 6 across all sessions and 4 per session by default, 1 to 12 each; a session cannot have more than the total.
- **Auto-resume interrupted runs** (off by default) applies only to eligible legacy SDK runs, at most twice per run. Settings also reports whether detached workers outlived the last Pi stop.
- **Sandbox local agents**: `Required` blocks all new local runs. With `When possible` (default) or `Off`, local ACP is unsandboxed. The SDK sandbox check and fallback apply only to legacy local agent-mode recovery.

## What a run may do

| | `ask` (default) | `plan` | `agent` |
| --- | --- | --- | --- |
| local (ACP) | negotiates CLI ask mode | negotiates CLI plan mode | negotiates CLI agent mode, with unrestricted native tools; requires the local edit switch |
| cloud | a plan (cloud has no read-only ask) | a plan | works on a branch of its own, opens no pull request; needs the cloud switch and an allowed repository |

- A local run works in the session's directory, or a directory below it given as `path` (checked on real paths, so a link
  out is refused). It is refused when the session works on another environment (SSH, a sandbox): the CLI runs on the
  Pi server's machine. This directory is not a confinement boundary.
- The owner sets how many runs may go at once, in **Settings › Cursor**: all sessions (default 6) and per session (default 4), each 1 to 12, a session never above the total; the code never goes past 12. A refusal names the current caps and where to change them. Each run lasts at most 120 minutes (default 30). A run past its time is cancelled
  and, if Cursor does not answer, given up on. Prompts are at most 20 000 characters. Pi keeps at most 16 000 characters
  of a result and the wake carries the first 1 500. Pi keeps the last 50 finished runs.
- Only the session that started a run can see, read or cancel it.

## Local access and models

**Local ACP is unsandboxed.** Pi requests and verifies the CLI mode before sending the prompt and cancels if the CLI reports a mode change. Ask and plan deny permission callbacks; enabled agent mode can approve a unique one-time permission option during its turn. Pi does not supply client filesystem, terminal, or MCP tools. These rules do not constrain the CLI's native access, user/project configuration, hooks, or MCP discovery. The CLI uses the Pi server account's `HOME` and `PATH` and can access what that account can. `Required` always refuses new local runs; there is no fallback to the SDK.

Local runs use the model advertised and confirmed by the CLI when specified, otherwise its current model. The SDK's catalog and `modelParams` apply to cloud runs only. `cursor_models` returns the SDK model IDs and accepted parameters for the key (cached for ten minutes). For cloud, a CLI-style name such as `claude-opus-5-thinking-high` is mapped to an SDK model and parameters only when the match is unambiguous.

## Runs and restarts

A local run is a **detached agent process** (`agent-process.ts`, started with the server's `node`, in a session of its own,
output to a file). Pi only observes it through a directory `<P2_DATA_DIR>/cursor-runs/<run id>/` (mode 0700, files 0600,
written atomically): `request.json` (what it was asked), `status.json` (the heartbeat), `partial.txt` and `events.jsonl`
(what it streams), `result.json` and `exit.json` (written last: a clean end), `cancel` (a marker Pi writes), `worker.log`.
Only a legacy SDK worker receives the API key, via its environment; it removes the key before it starts the agent and redacts it from output. New local ACP workers use the CLI sign-in and receive no API key. It repeats the cwd, mode and edit checks itself, enforces its own deadline and watches for the
cancel marker; Pi also kills it if it ignores a deadline or cancellation. The ACP guard owns the CLI’s process group and kills ordinary descendants on worker loss. This is cleanup, not containment; a child that leaves that group is outside the guarantee.

**Surviving a Pi restart is a convenience, not durability.** A Cursor run is not a Pi session: nothing makes it come back.
If the worker dies (Pi stopped under it by a service manager, a crash, a kill, a reboot, the machine shutting down) the run
is *interrupted*. What a restart does:

- worker still running (pid and start time match): Pi follows its files again and the run goes on;
- worker finished while Pi was down: Pi reads `exit.json`/`result.json`, records the result and publishes the wake once;
- worker gone without `exit.json`: the run is `interrupted`, with the partial text and last activity (never an empty
  result when text was streamed). A legacy SDK run is `failed` if its worker died before it got an agent ID. ACP runs stay `interrupted` and cannot resume.

Pi watches each worker's **heartbeat** (every 15 s, in `status.json`): `cursor_status` and `cursor_list` show `health`
(`running`, `stale-heartbeat`, `interrupted`, `finished`, `failed`, `cancelled`, `timed-out`), the last activity and the
files an editing tool named. A stale heartbeat with the process alive (a sleeping machine) is only a warning; the run is
interrupted when the process is gone or its pid belongs to another process now. Cloud runs live at Cursor and are found
again through the SDK.

### Interrupted runs and `cursor_resume`

An interrupted ACP run cannot resume or automatically replay. Read the partial result and check the working directory before deciding whether to start a new task.

An interrupted SDK run can resume if its agent ID is still known. The
SDK resumes a local or cloud agent by id (`Agent.resume`, as `cursor-agent --resume` does in the CLI); after a worker is
killed the SDK still holds the dead run as active, so the resumed send says `local.force` to expire it (checked against the
real SDK: a plain send fails with "already has active run", a forced one goes on and the agent remembers the earlier
conversation). Pi keeps the Cursor agent id, directory, mode, model, sandbox setting, heartbeat and partial text.

`cursor_resume` (`id`, optional `instruction`) starts a new worker that resumes the same agent and sends: *You were
interrupted by `<event>` at `<time>`; your previous partial work is on disk in `<cwd>`; check the state of the files, then
continue the task.* plus its last activity and the instruction. It needs a nudge and a check of what state the files were
left in: it does not come back like a Pi subagent. Limits still hold: the caps on runs at once, 120 minutes **in
all**, edits only while the owner allows them, the directory re-checked on real paths, legacy SDK sandbox policy (required, when possible, or off). A run that finished, failed or was cancelled cannot be resumed. If Cursor refuses the resume (an agent id it
no longer knows) the run becomes `failed` and keeps its partial text.

The wake says what interrupted the run and includes its partial result and last activity where available. An eligible SDK wake mentions `cursor_resume`; with **Auto-resume** on, Pi can resume it automatically and says so.
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
- **The working directory is not a sandbox.** New local ACP runs use the CLI's negotiated mode and native tools; see [local access](#local-access-and-models).
- A run's directory holds its prompt (`request.json`) and what it streamed: it is as sensitive as the run. Only the server's
  user can read it, and it is not removed when a run ends (the last 50 runs' records are kept in Pi's state, the directories
  stay until the operator deletes them).
- Cursor's output is untrusted. Pi quotes it, bounds it and labels it; the agent must verify it, and never follow it.
- The key never appears in tests, logs, errors, settings reads or stored runs (the tests search every file of the data
  directory for it).

## Tests

`__tests__/p2/cursor.test.ts` and `ui-cursor.test.ts` run against a fake `@cursor/sdk` package
(`__tests__/fixtures/fake-cursor-sdk`) installed into the fixture plugin's `node_modules`, for cloud and legacy SDK recovery. ACP tests substitute only the CLI executable, using the installed Cursor plugin’s real worker, lease guard and transport. Neither suite contacts Cursor.

## Developer notes

- Changing a stored schema needs version+1 and migrate. That holds for `p2.cursor-config` (now 4) and `p2.cursor-runs` (4) (the
  persisted states; `p2.cursor-survival` is new, at 1) and for every contract and local store (`p2.cursor-store`, `p2.cursor-runs`, `p2.cursor-settings`): a changed
  shape under the same version fails to load where the old object is stored. `__tests__/p2/cursor-upgrade.test.ts` starts the
  plugin on a data directory written by the first release (`__tests__/fixtures/cursor-v1-store.ts`, frozen); when you
  bump a version, add what that version wrote to the fixture the same way.
- The stimulus source `cursor.run` stays at version 1: its event only gained optional fields (including `backend: "acp"`) and the status `interrupted`,
  so stored events remain valid. A change that makes an old event invalid needs source version 2 with the old one kept registered.
