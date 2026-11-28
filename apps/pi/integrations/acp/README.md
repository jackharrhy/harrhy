# ACP delegation (experimental)

This optional p2 plugin gives agents one foreground `acp_task` tool for Antigravity (`agy acp`) and Cursor (`agent acp`). See the [design note](DESIGN.md) for mode and access details.

Install `acp` as a real directory in the Pi plugin root. The plugin has no npm dependencies. Use a trusted installation of Google's official Antigravity CLI that supports `agy acp` (`agy acp --help`). [Sign in outside Pi](https://antigravity.google/docs/cli/acp/) under the same test account and home. Set the test server's startup environment:

- `HARRHY_PI_ACP_AGY`: absolute path to the Antigravity CLI executable.
- `HARRHY_PI_ACP_WORKSPACE`: absolute path to an approved disposable workspace. The session must be local and in exactly that workspace.

For a session-scoped trial instead, the operator can put `trial.json` in the installed plugin directory with `command` and `workspace` set to absolute paths and `session` set to the one permitted Pi session ID. It takes precedence over the environment and is read for each call. Remove the file to end the trial (unless the startup environment also enables ACP). Do not commit it or put credentials in it.

To enable Cursor, add `cursorCommand` with the absolute path to the signed-in Cursor CLI to `trial.json`. Cursor defaults to `ask`, and also supports `mode: "plan"`. Set `allowCursorAgent: true` to permit `mode: "agent"` in the approved session. Agent mode uses Cursor's own shell, file, and other tools and approves unambiguous one-time tool requests during the prompt. It does not grant persistent permissions, answer questions, or approve plans. Give that session only to people you trust with the Pi server user's access. Sign in to either CLI outside Pi. Prompts and any gathered context go to the selected provider. This plugin adds no sandbox: denying ACP permission requests does not limit the CLI's own filesystem access. Use a disposable workspace unless the operator has explicitly accepted that access for the trial. A task waits for a single reply, with a two-minute deadline. It is not resumable.

```js
text(await tools.acp_task({ prompt: "Without reading or writing files, reply with ACP OK." }));
text(await tools.acp_task({ agent: "cursor", model: "composer-2.5", prompt: "Without reading or writing files, reply with ACP OK." }));
text(await tools.acp_task({ agent: "cursor", mode: "agent", model: "composer-2.5", prompt: "Run pwd and report its output." }));
```

Antigravity uses its current CLI model. Cursor uses its current model unless `model` is supplied, in which case the CLI must advertise and confirm the selection.
