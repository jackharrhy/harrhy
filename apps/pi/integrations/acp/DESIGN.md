# Agent delegation in Pi

Local Antigravity and Cursor use `agy acp` and `agent acp`. Cursor Cloud stays on `@cursor/sdk`: the CLI protocol doesn't provision or reattach to Cursor-hosted VMs. Both CLIs authenticate outside Pi. Pi doesn't pass the SDK API key to either CLI.

## Foreground and detached runs

`acp_task` runs one turn in an operator-approved local workspace, with a two-minute deadline. It has no persistent state, and it doesn't replay a prompt. It accepts either CLI. Cursor can run in `ask`, `plan`, or operator-enabled `agent` mode. `cursor_task` provides detached Cursor runs with the existing run IDs, partial output, cancellation, and completion wake. The local and foreground paths share the ACP transport and Cursor negotiation in `cursor/acp-runtime/`.

New detached local Cursor starts use ACP. The local SDK path remains for previously recorded SDK runs; the code doesn't fall back to it on ACP failure. An ACP run never stores a CLI session ID in an SDK ID field, and interrupted ACP prompts aren't replayed. Cloud starts and recovery still use the SDK.

## What the modes grant

Pi verifies the Cursor mode before prompting and stops the turn if the CLI leaves it. `ask` and `plan` reject permission requests. `agent` can use the CLI's native shell, file, and other tools. During that turn the client honors a unique `allow_once` option for that session, never a standing grant. It does not answer a Cursor question or approve a plan on the user's behalf.

Pi doesn't implement ACP client filesystem or terminal calls and supplies no MCP servers. That is not a sandbox: the CLI can load ambient settings, rules and MCP and has the Pi server user's OS rights. Directory checks select the working directory, not the limit of its access. Use only in trusted sessions and workspaces. The detached `Required` setting refuses new ACP local runs rather than silently running them unsandboxed.

The transport bounds the protocol stream and assistant text. It cancels the turn on abort and cleans up its POSIX process group. Detached local workers additionally pass a lease checked by their launcher, so the group is cleaned up if the worker dies. This does not contain descendants that create another process group or session.
