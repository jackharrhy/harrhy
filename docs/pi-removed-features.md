# Removed Pi features

Features taken out of [Pi](../apps/pi/README.md) because the instance owner did not use them, with what each did and
what is worth bringing back. Everything is in git history: check out the last commit listed, or read the removed paths
at that commit.

<!-- prettier-ignore -->
| Feature | Last commit that has it | Removed paths |
| --- | --- | --- |
| Radius | `33a97c44` | `plugins/radius`, `plugins/sync`, `plugins/ports`, the shell bridge, Cloud Brain, `--radius` |
| Voice | `16e22a10` | `plugins/voice`, `voice-server/` |
| Discord | `16e22a10` | `plugins/discord` |
| Telemetry panel | `16e22a10` | `plugins/telemetry` |
| Terminal UI | `48c0ac80` | `src/tui`, `src/hosts/tui*`, `src/runtime/tui*`, `src/api/v1/tui.ts`, every plugin's `tui*.ts`, `plugins/quiet-tools`, `docs/p2-tui-port.md` |
| Web terminal | `46d6b3a9` | `plugins/terminals` (including `vendor/ghostty`), the workspace's Terminal tab, the bottom terminal panel and its CSS |

Paths are under `apps/pi/`.

## Radius

A hosted relay for reaching a Pi from anywhere. The `radius` plugin connected an instance to Radius as a "brain". Radius
framed Pi's page in its own shell, which shared its theme and URL with the page, and authenticated other people by email.
Around it grew port forwarding through the relay (`ports`, including the agent's `ports` tool and the Envs panel), a
session-sync adapter (`sync`), sharing a session with a person by email, a static page build for Radius Cloud Brain, and
the terminal UI's `--radius` sign-in. Share links, guests and the join page stayed.

## Voice

Voice mode for a conversation. A composer button turned it on. The owner's browser had Pi's replies spoken aloud, once
for everyone, and each person's microphone became their own messages, relayed to the others. Each conversation was a
"voice room" for the owner and read/write guests.

Browsers never reached the speech service directly. Pi's server signed requests in and told the service who was talking.
`voice.json` in the data dir named the service and its token; without it voice mode was off. The service was
`voice-server/`, a Python speech-to-speech server with pluggable engines, sentence segmentation and a speech-text
cleanup so replies read well aloud. In the browser, `engine.ts` ran the audio loop, with barge-in and interruption
handling so a person could talk over the agent, and transcripts of what was said.

Worth trying again: proximity voice chat in [World](world.md), talking with friends and an agent in the same space. The
room model, speaking for the agent once for everyone, and barge-in are the pieces to reuse. Pi's browser audio code is
tied to its chat composer, so a second implementation inside World is likelier than moving it.

## Discord

Pi in a Discord channel, built on a discord.js bot. The owner registered bot tokens, then linked a session to a channel.

- A mention by someone allowed to wake Pi (anyone, or particular roles) delivered every message since the link's last
  cursor as one input; the answer was posted back, with files the agent offered through `send_file` attached.
- Linking moved the session into a Gondolin sandbox and locked it to resources the owner picked (MCP servers,
  instructions, messaging other sessions), because strangers in a channel could wake it.
- A Discord thread got its own subagent, forked from the main conversation. The channel commands were `stop`, `status`
  and `compact`. Attachments were downloaded into the session's uploads.

Only the bot file spoke Discord. The relay (`relay.ts`), the session side (`worker.ts`) and the lock handling knew
nothing of it. A general version would use [Chat SDK](https://chat-sdk.dev/) for the platform side (Slack, Teams, Google
Chat, Discord and others through adapters) and keep that session side: mention to wake, a sandboxed and locked session per
channel, one input per batch, a subagent per thread, and the commands. Chat SDK's state adapters use Redis or PostgreSQL,
so a small adapter over Pi's store would avoid running either.

## Telemetry panel

The Traces pane in Settings and the agent's `telemetry_*` tools, which read what Pi recorded about its own calls, holds,
methods and model requests. Only the readers were removed. Recording is still in the server, the session workers and the
owner's page, and is off unless `settings.json` has `"telemetry": true`; it writes `<data>/telemetry.sqlite`, which
nothing reads now.

## Terminal UI

A terminal client with the same capabilities as the web interface, started with
`node --import ./src/source.ts ./src/hosts/tui.ts` (`--session <id>` opened one session). About 20,000 lines.

- The launcher (`src/hosts/tui*.ts`) was the only trusted part. It signed in with the host's owner key, an owner link
  or a share link (as a named guest) and kept the cookie. The interface itself was one bundle the server built from the
  plugins and served at `/__p2_tui`, run in a worker thread that saw only Chord frames. Clipboard, opening URLs,
  downloads, the external editor and sign-out were launcher "grants", confirmed on a consent screen the launcher drew.
- The runtime (`src/runtime/tui*.ts`, `src/tui/`) had a session picker, a conversation view with pi's editor,
  transcript and tool cards, overlay lists, and one command registry behind key bindings, slash commands and the
  palette, with a `when` condition per command. Themes were derived from the terminal's own colours; key bindings and
  settings were per visitor. Mermaid code blocks were drawn as Unicode diagrams (`grok-mermaid`).
- `tui` was a plugin facet kind beside `server`, `worker` and `web`: a plugin's `tui.ts` drew in the terminal as its
  `web.tsx` does in the page. 25 plugins had one, for sharing, files and downloads, the tree, models, provider login,
  MCP, environments, logs, the workspace, subagents, artifacts and more.

The design is in `docs/p2-tui-port.md` at that commit. Its sections 8 and 10.8 also describe `@` file completion,
`!cmd` shell entries, skills and prompt templates, and fork and clone, which the web still has. There is a lot of
reusable machinery in the removed code: the command registry, the sandboxed bundle with launcher grants, the theme
derivation and the Mermaid renderer stand on their own.

Worth keeping in mind:

- Goal mode's `/goal` command was in the terminal UI and nothing else starts a goal. The `goal` plugin and its
  contract are still there ([goal mode](../apps/pi/docs/goal-mode.md)); it needs a web control to be usable again.
- The `quiet-tools` plugin (one line per tool call), the per-visitor preferences served from `<data>/tui.json`, the
  `SentFiles` text preview of the session worker and the Settings row for the model cycling scope existed only for the
  terminal and went with it.
- Still in the tree: the `@earendil-works/pi-tui` library (`compat/packages/tui`; `@` file completion ranks with its
  `fuzzyMatch`), Chord's own `tui` modules, and the `enabledModels` setting with the `Models` contract's scope
  members, which nothing reads now.
- Left on a machine that ran it, read by nothing now: the launcher's `~/.pi/p2-tui/` (preferences and saved sign-in
  cookies) and `<data>/tui.json`.

## Web terminal

Shells in the browser, owner only. The `terminals` plugin opened a terminal at the viewed conversation's location (local,
SSH or sandbox) and the agent drove the same terminals with a `terminal` tool. About 5,600 lines plus the wasm.

- A detached terminal host (`main.ts`, started by `detached.ts`; one per data dir, behind a process lock) owned the
  PTYs through the `pi-env` daemon, so shells outlived server and worker restarts. It exited after ten minutes with no
  terminals and no clients, kept a headless libghostty-vt copy of each screen for reconnecting browsers, and published
  its logs as `<data>/terminals.logs.json` for the Logs sheet.
- The server side (`server.ts`, `service.ts`, `contract.ts`) served the owner-only `Terminals` object per session and
  view and a `/terminal` WebSocket for bytes; control was Chord. The page (`Terminal.tsx`, `web.tsx`) drew libghostty-vt
  (`vendor/ghostty`, MIT, `ghostty-vt.wasm`) into DOM rows with its own selection, scrolling, IME and clipboard
  handling, a row of keys phones lack, tabs per terminal, and a placement either below the chat or as the workspace's
  Terminal tab.
- The `terminal` tool (`tool.ts`, `commands.ts`) took tmux commands as argv (`new-session`, `send-keys`, `capture-pane`,
  `wait-for` and the like) on the session's terminals, replay-safe across restarts, with its own transcript block
  (`activity.tsx`). It was a deferred tool, reachable through code mode or `tool_search`.
- Around it: the top bar's Terminal button, the command menu's terminal commands, `OpenTerminal` (a transcript block
  opened its terminal), the `terminal`/`startTerminal` route fields and their per-device memory, the `terminal-actions`,
  `chat-bottom` and `workspace-terminal` slots, `.terminal-*` styles, the `.wasm` asset loader and `?url` import in the
  test bundler, the page CSP's `wasm-unsafe-eval`, and the "Terminal host" log source.

Worth keeping in mind:

- The agent still has `bash`, which runs one command to completion. Nothing now gives it a long-lived interactive
  shell, a way to watch a dev server's output, or something to drive a REPL; that was the `terminal` tool.
- Still in the tree: `pi-env`'s `openTerminal` and the daemon's PTY support (`compat/packages/env`), which nothing in
  the app calls now, and `silenceTimeoutMs` in `src/web/reconnect.ts`, which only the terminal's socket used.
- Left on a machine that ran it, read by nothing now: `<data>/terminals.logs.json`, the host's socket
  (`p2-<key>-t.sock` in the temp directory) and the browser's remembered terminal placement. A terminal host started
  before the upgrade keeps running until its ten idle minutes pass or it is killed, since it was detached.
