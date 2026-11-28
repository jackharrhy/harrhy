# Agent delegation in Pi

Local Antigravity and Cursor use `agy acp` and `agent acp`. Cursor Cloud stays on `@cursor/sdk`: the CLI protocol doesn't provision or reattach to Cursor-hosted VMs. Both CLIs authenticate outside Pi. Pi doesn't pass the SDK API key to either CLI.

## Foreground runs

`acp_task` runs one turn in an operator-approved local workspace with a two-minute deadline. It has no persistent state and does not replay prompts. It accepts either CLI. For a hosted Cursor VM, install the separate [Cursor Cloud integration](../cursor/README.md).

## What the modes grant

Pi verifies the Cursor mode before prompting and stops the turn if the CLI leaves it. `ask` and `plan` reject permission requests. `agent` can use the CLI's native shell, file, and other tools. During that turn the client honors a unique `allow_once` option for that session, never a standing grant. It does not answer a Cursor question or approve a plan on the user's behalf.

Pi doesn't implement ACP client filesystem or terminal calls and supplies no MCP servers. That is not a sandbox: the CLI can load ambient settings, rules and MCP and has the Pi server user's OS rights. Directory checks select the working directory, not the limit of its access. Use only in trusted sessions and workspaces.

The transport bounds the protocol stream and assistant text. It cancels the turn on abort and cleans up its POSIX process group. This does not contain descendants that create another process group or session.
