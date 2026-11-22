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
