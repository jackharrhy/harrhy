# Cursor

A trusted plugin that lets an agent hand a task to a [Cursor](https://cursor.com) agent through the official
[`@cursor/sdk`](https://cursor.com/docs/sdk/typescript), on this machine (`local`) or in a Cursor-hosted VM (`cloud`).
Cursor is a tool, not a model: no model provider is added. A run never holds the turn. The tool returns a run id, Pi
watches the run, and when it ends Pi wakes the session with one stimulus. It declares the stimulus source `cursor.run`
version 1; the stimuli plugin owns the saved delivery, retry and receipt.

- `server.ts`: the facet (the owner's settings, the agent's remote, the watcher). `runs.ts`: starting, supervising and
  ending runs, and publishing the one stimulus. `policy.ts`: what a run may do. `store.ts`: settings and runs in p2 state.
  `secrets.ts`: the key file. `web.tsx`: Settings › Cursor.
- `client.ts`: the interface Pi talks to Cursor through. `sdk.ts`: the one file that knows the real SDK.
- `render.ts`, `contract.server.ts`: how a result reads to the agent. `contract.ts`: the shapes and limits.
- `worker.ts`: the agent's five tools.

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
3. In **Settings › Cursor** (owner only) enter the API key. That is the only configuration; there is no config file.

## Settings

- **API key**: write-only. Stored in `<P2_DATA_DIR>/cursor-secrets.json` (mode 0600), never sent back to the browser,
  never logged, taken out of every error and result Pi shows or keeps, and registered with the server's log redactor.
  **Test key** makes one harmless call (who the key is) and reports the key's name, not the key. With no stored key Pi
  uses `CURSOR_API_KEY` from the server's environment.
- **Defaults**: the model (chosen from the list the SDK reports for the key) and the runtime (`local` or `cloud`).
- **Allowed repositories**: `owner/name` or `owner/*` (case-insensitive). A cloud run starts only on a listed repository.
- **Allow local agents to edit files** (off by default) and **Allow cloud agents to change repositories** (off).
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
- At most 4 runs go at once, 2 per session, each for at most 120 minutes (default 30). A run past its time is cancelled
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

## Agent tools

`cursor_task` (`prompt`, `runtime`, `mode`, `model`, `modelParams`, `repo`, `branch`, `path`, `timeoutMinutes`), `cursor_models`, `cursor_status`,
`cursor_result` (`id`, `maxChars`), `cursor_cancel` and `cursor_list`. `cursor_task` is refused in read-only conversations. The run id comes from the tool call, so a replayed call is the same run.

The wake says it came from Cursor, names the run id, quotes a bounded summary line by line, and says that it is untrusted
input to verify, not instructions. One event is published per run and ending (`<run id>:<status>`): watching again,
a restart or a retry never repeats it. If the server restarts while a cloud run goes, Pi finds the run again; a local
run does not survive a restart and ends as failed.

## Data and safety

- **What leaves the machine.** Your prompt, every file the agent reads and every tool result go to Cursor. A cloud run
  clones the repository into a Cursor VM. Local runs also keep transcripts under `~/.cursor/projects/` of the server's
  user. Check your team's **privacy mode** and data-retention terms in Cursor before using a work account, and send
  nothing secret.
- **Read-only is by tool selection, not a jail.** `ask` and `plan` offer only read tools, but those read any path the
  server's user can read: the directory is the working directory, not a confinement. `agent` mode asks for Cursor's own
  sandbox to keep shell writes inside the working directory, and runs without it where the machine cannot give one
  (unless the owner set it to required). The owner decides with the edit switch.
- Cursor's output is untrusted. Pi quotes it, bounds it and labels it; the agent must verify it, and never follow it.
- The key never appears in tests, logs, errors, settings reads or stored runs (the tests search every file of the data
  directory for it).

## Tests

`__tests__/p2/cursor.test.ts` and `ui-cursor.test.ts` run against a fake `@cursor/sdk` package
(`__tests__/fixtures/fake-cursor-sdk`) installed into the fixture plugin's `node_modules`, with the real adapter, server,
worker and stimuli. Cloud mode is tested only against that fake.
