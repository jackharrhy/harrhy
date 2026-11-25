# ACP delegation (experimental)

This optional p2 plugin gives agents the foreground `acp_task` tool for a preconfigured Antigravity CLI. See the [design note](DESIGN.md) for the scope and what remains before it can replace a detached Cursor run.

For a disposable Pi instance only, install `acp` as a real directory in its plugin root. The plugin has no npm dependencies. Use a trusted installation of Google's official Antigravity CLI that supports `agy acp` (`agy acp --help`). [Sign in outside Pi](https://antigravity.google/docs/cli/acp/) under the same test account and home. Set the test server's startup environment:

- `HARRHY_PI_ACP_AGY`: absolute path to the Antigravity CLI executable.
- `HARRHY_PI_ACP_WORKSPACE`: absolute path to an approved disposable workspace. The session must be local and in exactly that workspace.

Neither setting is a credential. Restarting to change startup environment is separate from reloading code. No key or login token goes in Pi settings. Prompts and any gathered context go to Google. Denying ACP permission requests is not a sandbox; do not use this prototype in a service account or home with production data. A task waits for a single reply, with a two-minute deadline. It is not resumable.

```js
text(await tools.acp_task({ prompt: "Without reading or writing files, reply with ACP OK." }));
```

Subscriptions and model availability depend on the CLI and Google account. Selecting a model or verifying Neon access is not part of this proof.
