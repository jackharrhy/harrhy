# ACP delegation (experimental)

This optional p2 plugin gives agents the foreground `acp_task` tool for a preconfigured Antigravity CLI. See the [design note](DESIGN.md) for the scope and what remains before it can replace a detached Cursor run.

For a disposable Pi instance only, install `acp` as a real directory in its plugin root. The plugin has no npm dependencies. Use a trusted installation of Google's official Antigravity CLI that supports `agy acp` (`agy acp --help`). [Sign in outside Pi](https://antigravity.google/docs/cli/acp/) under the same test account and home. Set the test server's startup environment:

- `HARRHY_PI_ACP_AGY`: absolute path to the Antigravity CLI executable.
- `HARRHY_PI_ACP_WORKSPACE`: absolute path to an approved disposable workspace. The session must be local and in exactly that workspace.

For a session-scoped trial instead, the operator can put `trial.json` in the installed plugin directory with `command` and `workspace` set to absolute paths and `session` set to the one permitted Pi session ID. It takes precedence over the environment and is read for each call. Remove the file to end the trial (unless the startup environment also enables ACP). Do not commit it or put credentials in it.

Antigravity owns sign-in. Prompts and any gathered context go to Google. This plugin adds no sandbox: denying ACP permission requests does not limit the CLI's own filesystem access. Use a disposable workspace unless the operator has explicitly accepted that access for the trial. A task waits for a single reply, with a two-minute deadline. It is not resumable.

```js
text(await tools.acp_task({ prompt: "Without reading or writing files, reply with ACP OK." }));
```

Subscriptions and model availability depend on the CLI and Google account. Selecting a model or verifying Neon access is not part of this proof.
