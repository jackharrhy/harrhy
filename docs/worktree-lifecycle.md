# Worktree lifecycle

Use the shared `worktrees` skill for Git commands and safety checks. These are Harrhy's task and runtime boundaries, not a second worktree registry.

## Start with a disposal plan

Use the primary checkout for uncontended work. Create a worktree only for concurrent writers or necessary isolation; do not create one just for an audit or small documentation edit. Resolve your finished checkouts before adding another.

In the task's existing handoff or PR, record its owner, purpose, branch, PR status, and intended end: remove after delivery, preserve a named commit for unfinished work, or retain for a specific active runtime. Include an approximate dependency/fixture budget when substantial. Keep secrets and private inventories out of repository metadata.

## Finish the source task

- Ready work belongs in a reviewed PR with the applicable checks. Merging the source does not complete checkout cleanup.
- Meaningful unfinished work needs an explicit next step: a draft PR, or a named branch with a commit and a short explanation of what remains. Do not rely on a stash, detached HEAD, or an untracked directory as its only copy. Review files before committing; never bulk-commit unknown data or credentials.
- Superseded experiments need a stated disposition, not indefinite retention as “possibly useful.” Preserve genuinely unique changes before removal; ask a specific owner decision when their value is unclear.

## Retire the checkout

Inspect tracked, untracked and ignored files, then check active agents, processes, effective service paths, preview routes, mounts and Compose build contexts. A clean Git status or lack of open files alone is insufficient. Classify databases using their source/configuration and bounded read-only metadata: generated fixtures, human data and authentication state are different retention cases.

Remove only confirmed reproducible dependencies, outputs and fixtures. Preserve private state and review evidence that is still needed. Move agent session working directories to an existing stable checkout before retiring their paths. Use normal `git worktree remove`; investigate refusals rather than forcing them. Prune stale registration metadata only after verifying the directory is absent.

Keep a branch while it preserves unique commits, pending review or an explicit owner need. Once its work is preserved in merged source or another verified reachable ref and no user needs it, remove the obsolete branch through normal Git checks; do not force-delete it merely because a squash-merged PR exists.

## Separate persistent runtime from task lifetime

New long-running previews should have an operator-owned runtime location outside disposable worktrees, with durable data and secrets in appropriate XDG or deployment-managed storage. Coordinate any migration of an existing service; this policy does not authorize moving a live checkout, changing routes or restarting services. A retained runtime checkout must name the concrete dependency and who will retire it.

Tests should track the exact container and volume IDs they create, label their purpose, and provide scoped teardown within the test's authorization. Never infer that unattached volumes are disposable, use a shared-volume prune, or delete production or recovery state as checkout cleanup. No automatic age-based deletion or cleanup cron.
