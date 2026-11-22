# Features removed from Pi

Features taken out of Pi, with what each did and what to look at if one is wanted again. Restore from git history.

<!-- prettier-ignore -->
| Feature | What it did |
| --- | --- |
| [PowerShell](#powershell) | Offered Durable's `powershell` tool to agents working on Windows machines |

## PowerShell

The `powershell` plugin offered Durable's deferred `powershell` tool to each conversation (the main agent and every subagent) whose location's machine ran Windows and that had the `bash` tool. It decided from the local platform or the remote environment's OS report, retried unreachable remotes every 30 s, and showed calls in the chat as a command block.

Removed: `plugins/powershell` (contract, worker, web facet, activity) and its entry in the transcript test fixture.

Kept: the vendored `createPowerShellTool` in `compat/packages/durable`, which shares code with `bash` and is part of that package's public exports, and the SSH environment's PowerShell probing, which detects Windows hosts and is unrelated.
