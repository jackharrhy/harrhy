# Local patch maintenance

This document belongs to the local integration branch, not upstream policy.

## Patch policy

Keep local behavior changes in small commits above a deliberately selected upstream revision. Rebase; do not merge upstream into the integration branch. Never push rewritten history without separate authorization. Keep machine paths, service configuration, credentials and runtime data out of portable commits.

The local sidebar patch hides the built-in Folders rollup from navigation and excludes it when selecting the active sidebar row. It does not remove folder list routes, search, model grouping or persisted sidebar settings. The sessions list and Archive remain available. Its browser expectations belong with the behavior patch.

## Update procedure

1. Read `AGENTS.md`, `docs/handoff.md`, `docs/p2-notes.md` and the machine's private runtime runbook. Coordinate with other sessions before touching their edits or restarting the server.
2. Inspect branch, remotes, remote default branch, upstream tracking, dirty/untracked/ignored files and local commits. Fetch before selecting a target; deepen a shallow checkout when ancestry is incomplete.
3. Create a recovery ref at the old HEAD. Privately back up dirty content and relevant ignored data (including generated model JSON). Leave dependency directories and private runtime data untouched unless a reviewed install or runtime procedure requires otherwise. Do not use stash, reset, clean or blanket staging.
4. Adopt another session's patch only with explicit permission. Check it, stage explicit paths, and make a focused commit before rebasing. Stop on ambiguous conflicts or conflicts outside authorized files.
5. Rebase onto the inspected upstream target. Compare the patch series with `git range-diff`; inspect the resulting files in full. Repository-local `pull.rebase=true` and branch-specific rebase settings are appropriate; do not change global Git configuration.
6. If dependencies changed, use `npm install --ignore-scripts` and check for unintended lockfile changes. If catalog definitions changed, refresh ignored model values with `npm run hydrate:model-data`; never stage those JSON files or hand-edit generated model wrappers.
7. Run root and p2 checks, then focused tests for local changes and important upstream changes. Record failures, skipped browser coverage and prerequisites accurately. Build packages before tests that need `dist/`. Never use live sessions or real providers as test fixtures.
8. Apply plugin-only changes with `reload_plugins`. Runtime/base/workspace-package changes require an explicit supported restart. A standalone service without the dev supervisor uses its machine runbook's service restart, not a second server sharing its data. Coordinate restart while sessions are active; verify readiness afterward without printing sign-in credentials.
9. Record old/new upstream and local revisions, recovery locations, test results, runtime state and unresolved issues in the private machine runbook or maintenance log. Finish with clean status and no unrequested push.

## Recovery

A recovery ref preserves committed source; a private patch/file backup preserves dirty source; neither is a runtime database backup. Prefer a new recovery branch or worktree for source inspection. Do not overwrite current session history with an old data snapshot merely to roll source back. Stop and consult the owner before destructive recovery or a data migration.
