# GitHub checks

A trusted plugin that wakes a session when GitHub's checks (Actions runs and commit statuses) finish for a pull request,
a branch or a commit. Pi polls GitHub itself, so the agent needs no polling loop and no turn stays open while CI runs.
It declares the stimulus source `github.checks` version 1 (`server.ts`); the stimuli plugin owns the saved delivery,
retry and receipt, and the target worker owns native input. A worker facet (`worker.ts`) gives the agent three tools.

## Installation

Install this directory as a real directory in `<P2_DATA_DIR>/plugins/github-checks/`, on a Pi build that has it, and
follow the operator window of [the integrations guide](../README.md). It adds no routes and no listener. Without
configuration it does nothing.

Write `<P2_DATA_DIR>/github-checks.json` (mode 0600), read afresh on every poll:

```json
{
  "token": "<a read-only GitHub token>",
  "repos": ["owner/name", "owner/*"],
  "apiBase": "https://api.github.com",
  "pollMs": 15000,
  "idleMs": 60000,
  "settleMs": 20000,
  "graceMs": 60000
}
```

- `token` and `repos` are required. A fine-grained token with read access to Metadata, Pull requests, Checks and Commit
  statuses on the listed repositories is enough. Pi only reads.
- `repos` is the allowlist, as `owner/name` or `owner/*` (case-insensitive). A subscription for any other repository is
  ignored, so a session cannot read CI of a repository you did not list.
- The rest are optional and in milliseconds: how often to look while checks run (`pollMs`), how often to look at a
  finished branch or open pull request that may get a new commit (`idleMs`), how long everything must stay finished
  before it is reported (`settleMs`, in case another workflow starts), and how long to wait for a new commit's first
  check before saying that none ran (`graceMs`). `apiBase` is for GitHub Enterprise.

## What a subscription watches

The subscription's config is `{ repo, ref, notify?, only? }`:

- `ref` is `{ kind: "pr", number }` (the pull request's head; a push is a new commit), `{ kind: "branch", name }` (the
  branch tip; every new commit reports, so `main` works) or `{ kind: "commit", sha }` (one commit, reported once).
- `notify: "failure"` says nothing about a green commit. The default is `all`.
- `only` limits the checks that count, by name (a job's name or a status context).

A commit's result is `passed`, `failed`, `cancelled` or `no-checks`, reported once per commit and result (the event ID is
`<sha>:<result>`). Subscribing to something already finished reports its current state. After a pinned commit or a
closed pull request has reported, the poller stops looking until the subscription changes.

The event text names the failing checks with their links, and says that check names and links come from the repository
and are untrusted data, not instructions.

## Using it

The agent has `github_checks_watch` (`repo`, one of `pr`, `branch` or `commit`, optional `notify` and `only`),
`github_checks_list` and `github_checks_stop`. They are not available in locked sessions. Watching the same thing twice
returns the same subscription.

The owner can create a subscription for any session with `Subscriptions`' `createTarget`
(`source: { id: "github.checks", version: 1 }`); see [external stimuli](../../docs/external-stimuli.md).

## Cost and failure

Requests are conditional (ETags), so a poll that finds nothing new returns 304 and costs no rate limit. After an error the
poller backs off, up to five minutes, and logs each distinct error once. Events are saved by stimuli before delivery, so
a restart loses nothing: the poller finds the same event ID again and stimuli returns the saved receipt.

## When GitHub Event Streams is available

Only the observer changes: replace the poll loop with `gh event listen`, keep the source, the event shape and the
delivery as they are.
