# GitHub checks

A trusted plugin that wakes a session when GitHub's checks (Actions runs and commit statuses) finish for a pull request,
a branch or a commit. Pi polls GitHub itself, so the agent needs no polling loop and no turn stays open while CI runs.
It declares the stimulus source `github.checks` version 1; the stimuli plugin owns the saved delivery, retry and receipt,
and the target worker owns native input.

- `server.ts`: the facet (the owner's settings, the probe the agent's tools call, the poller's loop). `poller.ts`: what to
  look at and when to publish. `settings.ts`: the allowed list and `github-checks.json`. `access.ts`: the token and the
  client. `github.ts`: a small read-only REST client. `web.tsx`: Settings › GitHub.
- `checks.ts`: the rules (when a commit is done, what its result is, how it reads). `contract.ts`: the shapes.
- `worker.ts`: the agent's three tools.

## Installation

Install this directory as a real directory in `<P2_DATA_DIR>/plugins/github-checks/`, on a Pi build that has it, and
follow the operator window of [the integrations guide](../README.md). It adds no routes and no listener.

Nothing needs configuring in a file. In **Settings › GitHub** the owner lists the repositories Pi may watch, as
`owner/name` or `owner/*` (case-insensitive), and can check that Pi's GitHub login works. The agent's tool refuses any
other repository, and a subscription made another way for one is not watched. Until a repository is listed, agents
cannot watch anything. Only the owner has the list.

Pi reads GitHub with the login of the `gh` command: it runs `gh auth token --hostname <host>` (the web host of `apiBase`,
`github.com` by default) the first time it needs a token, keeps the answer for an hour, asks again after GitHub refuses
it, and keeps the old one if `gh` fails later. The server's PATH must find `gh` (under a macOS LaunchAgent that usually
means setting `ghPath` to its full path). That is the easy way to read private repositories with the login you already
have, but that token is usually broad (it can write).

For anything else there is an optional `<P2_DATA_DIR>/github-checks.json` (mode 0600), read afresh on every poll. It is as
sensitive as shell access, since `ghPath` runs a program as the server's user.

```json
{
  "token": "<a narrower GitHub token>",
  "ghPath": "/opt/homebrew/bin/gh",
  "apiBase": "https://api.github.com"
}
```

- `token` replaces the `gh` login. A fine-grained token with read access to Metadata, Pull requests, Checks and Commit
  statuses is narrower.
- Timings, in milliseconds: `pollMs` (how often to look while checks run; default 15000), `idleMs` (how often to look at
  a finished branch or open pull request that may get a new commit; 60000), `settleMs` (how long the finished checks must
  stay the same before they are reported; 20000), `graceMs` (how long to wait for a new commit's first check before
  saying that none ran; 60000) and `lingerMs` (how long to keep looking at a pinned commit or closed pull request after
  its checks last changed, for a later stage or a re-run; 600000). `apiBase` is for GitHub Enterprise (https, or http on
  loopback).

## What a subscription watches

The subscription's config is `{ repo, ref, notify?, only? }`:

- `ref` is `{ kind: "pr", number }` (the pull request's head), `{ kind: "branch", name }` (the branch tip, so `main`
  works) or `{ kind: "commit", sha }` (one commit; a later stage or a re-run shortly after reports again).
- `notify: "failure"` says nothing about a green commit. The default is `all`.
- `only` limits the checks that count, by name (a job's name or a status context). Pi waits for a named check that has
  not appeared yet while the commit is new or other checks still run.

A commit's result is `passed`, `failed`, `cancelled` or `no-checks`. A pull request or branch is followed: when its head
moves, the new commit gets its own result. Only the head Pi sees when it looks is judged, so a commit replaced before
its checks finish is not reported.

An event is identified by the commit, the result and which runs finished. Polling again or restarting never repeats an
event. A re-run, or a check added later, is a different set of runs and reports again, so a commit can report more than
once. Checks run in stages can look finished between stages; `settleMs` covers a short gap, not a long one.

A pinned commit and a closed pull request keep being looked at until their checks have been quiet for `lingerMs`, then
stop; a reopened pull request is not followed again. A subscription GitHub or the allowlist refuses (a repository the owner has not
allowed, a pull request or branch GitHub does not know, a private repository the token cannot see, a session that may
not be written to) is logged once and asked about again in an hour, and at once when the allowed list, `apiBase` or the token
change. Finished subscriptions stay listed and enabled; stopping one and watching it again reports its current state.

The event text names the failing checks with their links (at most 20), and says that check names and links come from
the repository and are untrusted data, not instructions.

## Using it

The agent has `github_checks_watch` (`repo`, one of `pr`, `branch` or `commit`, optional `notify` and `only`),
`github_checks_list` and `github_checks_stop`. They are not available in locked sessions. The tool asks the server to
check the allowlist and that GitHub knows the target (for a commit, that its checks can be read) before it subscribes,
and fails with the reason if not. Any session's agent can use this to learn whether a pull request or branch exists in
an allowed repository. Watching the same thing again from the same conversation returns the same subscription.

The owner can create a subscription for any session with `Subscriptions`' `createTarget`
(`source: { id: "github.checks", version: 1 }`); see [external stimuli](../../docs/external-stimuli.md).

## Cost and failure

Requests are conditional (ETags), so a poll that finds nothing new returns 304 and costs no rate limit. After an error
the poller backs off, up to five minutes, honours the rate-limit headers GitHub sends, and logs each distinct error
once. One subscription's trouble does not stop the others.

[GitHub Event Streams](https://github.blog/changelog/2026-11-17-github-event-streams-is-now-in-preview/) (in preview)
can replace the poll loop for pull requests (`gh event listen`); the source, the event shape and the delivery stay as
they are.
