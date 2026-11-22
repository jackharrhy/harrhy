# Harrhy contributor guidance

Before editing a workspace, read its README and any local `AGENTS.md`. See the [workspace index](README.md) and [architecture and workspace conventions](docs/architecture.md).

## Worktrees and pull requests

Use the primary checkout for uncontended work; isolate concurrent writers or tasks with concrete isolation needs. Read the shared `worktrees` skill (`~/.agents/skills/worktrees/SKILL.md`) before creating, relocating or removing worktrees. Start new task branches from freshly fetched `origin/main`.

Never edit another task’s checkout. Isolate dependencies, outputs, caches and runtime state per worktree, and use distinct server ports. Retry ordinary Git/GitHub races; update or rebase when conflicts, integration checks or GitHub require it, then rerun affected checks.

Use the [PR description skill](.agents/skills/pr-description/SKILL.md) for PR titles and bodies. Before merging, mark the PR ready, review the diff, run applicable local checks and verify all expected PR workflows succeeded on the exact head. Draft and ready PRs use the same checks; required-only queries are insufficient because GitHub does not enforce required checks here. Never bypass failures or safeguards.

Agents may create worktrees, push PRs and self-merge within owner-approved scope without coordinator permission. Notify Harrhy of the result. Ask through Familiar only for a specific unresolved product, security or destructive decision; include the PR link and reason. Remove finished worktrees only after preserving the work and checking private state and active users; never force removal to discard unknown data.

## App defaults

- Use TypeScript first for first-party source and tests; don’t default to JavaScript with JSDoc. Use Remix 3 and read the [Remix skill](.agents/skills/remix/SKILL.md) and installed guides before changing framework behavior.
- Use authenticated, resource-scoped Cap’n Web for first-party browser reads, mutations and subscriptions after the Remix document load. Keep native HTTP for documents, auth redirects and file transfers.
- Use [`@harrhy/live-state`](packages/live-state/README.md) for realtime state: `watch` in the browser, `channel` on the server. The app owns authorization and subscription behavior.
- Prefer qualified Celld for self-hosted durable coordination and Durable Objects for Cloudflare-native apps. Use one qualified immutable Celld artifact across apps and native previews; follow the [runtime guide](docs/celld-runtime.md).
- Keep browser tests scarce: reserve them for behavior that needs a real browser.

Run `mise run skills` to restore locked guidance ([setup and scope](docs/agent-skills.md)). Official Cloudflare skills supplement first-party logging and Remix guidance.
