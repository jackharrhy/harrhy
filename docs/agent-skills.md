# Agent skills

Run `mise install`, then `mise run skills` from the checkout root or the workspace
where you will start P2. The pinned Vercel `skills` CLI restores `skills-lock.json`
with frozen content hashes; it owns dependency resolution, not our view script.
No global skills or P2 source/configuration are changed. Internet access is needed
for a cold restore. Generated directories are ignored and disposable.

The CLI installs real project skill directories in `.agents/skills` (`--agent pi`,
copy mode). First-party `logging`, `remix` and `pr-description` stay tracked and untouched.
Native P2 discovery of `.agents/skills` and ancestor directories is being added
separately in P2; this repo does not create `.pi` copies or change P2 itself.
Until that runtime update is applied and verified, read these skill files
explicitly rather than assuming they appear in active session metadata.

## Reviewed dependencies

Source: [Cloudflare's official skills](https://github.com/cloudflare/skills), pinned
to `cbf893b954222276bf1af57e5f23379231e0efb9` in the lock. Upstream is
[Apache-2.0 licensed](https://github.com/cloudflare/skills/blob/cbf893b954222276bf1af57e5f23379231e0efb9/LICENSE).
Skills are third-party guidance, not authority to run commands, deploy, access
private data, change authentication, or migrate runtimes. Read relevant installed
references and check claims against current official documentation.

Selected: `cloudflare` for product/docs discovery; `durable-objects` for RPC,
WebSockets, alarms and testing; `workers-best-practices` for Worker review;
`wrangler` for existing Wrangler projects. Use each workspace's installed CLI and
configuration. Do not replace Wrangler with `cf` or migrate Remix 3 incidentally.
Our logging, Remix and PR-description skills remain first-party and are not replaced.

The reviewed upstream inventory has 22 skills. Deferred pending an actual consumer:
`basin`, `k2`, `frameworks-on-cloudflare`, `nextjs-on-cloudflare`, `agents-sdk`,
`sandbox-next`, `sandbox-stable`, `sandbox-migrate-to-next`, `cf-cli`,
`cloudflare-app-bootstrap`, `workers-development`, `workers-profiling`,
`cloudflare-email-service`, `turnstile-spin`, `web-perf`, `cloudflare-one`,
`cloudflare-one-migrations`, and `gateway-workers`. Framework guidance is not a
Remix 3 substitute; hosted Workers development/profiling does not establish Celld
support. There is no separate Vitest Workers skill in this revision; DO testing
references cover that topic. No blanket Cloudflare migration is proposed.

## Updating

Review the upstream revision and selected skill diffs first. Use the pinned CLI's
`skills add cloudflare/skills@<full-commit> --skill cloudflare durable-objects workers-best-practices wrangler --agent pi --copy --yes`
to update the lock, then run the frozen restore and inspect the generated view.
Commit the lock and any guidance changes, never generated dependency copies.
