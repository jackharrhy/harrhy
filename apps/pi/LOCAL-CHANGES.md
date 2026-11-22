# Intentional Pi differences

Harrhy owns this source. Update this list when a change alters an intentional difference. Record exact imported revisions and verification in provenance and the PR.

- **Session navigation:** Keep owner-controlled names and exact historical conversation links. Use upstream sidebar, queue, working and unread presentation. Do not bring back the custom activity tool or hover text, Folders suppression, or automatic Rex mirroring.
- **Projects:** Keep the server-store tables and one-time legacy import marker. Empty imported tables are authoritative; `projects.json` must not resurrect deleted projects.
- **Appearance:** Theme tint and custom sidebar branding are Harrhy-owned. The custom logo is not a guest-facing asset.
- **Previews:** Keep the owner-only registered URL list and expiration handling, without session or worktree inventory.
- **Automation:** Keep Goal, wakes, schedules and external stimuli. Preserve native admission, authorization and receipt identities. Atlas and Hermes remain optional user plugins. The optional `github-checks` plugin (GitHub check results as a stimulus source) is Harrhy-owned; the worker plugin API therefore exports `Subscriptions`.
- **Runtime:** Keep the supervised launcher, host-owned plugin API identity, nested compatibility lock and opt-in HTTP proxy. Compare the local MCP recovery and skills discovery fixes against upstream before carrying a duplicate implementation forward.
- **Conversation citations:** An agent may attach the current owner chat input to an ordinary peer send. Keep the private-session admission fence and destination-only verification; the quote proves authorship and wording, not approval inferred by the sender.
