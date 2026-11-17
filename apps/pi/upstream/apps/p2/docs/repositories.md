# Work context

Open **Views → Open plugin view → Work context** in a conversation. This owner-private native pane links
**Sessions / Worktrees / Previews**. It answers who is working where and which recorded preview can be opened;
it is not a Git status browser. Its internal plugin key remains `repositories`.

The owner selected **B · Linked inspector**: an index beside its selected item's details. On narrow panes,
select a row to drill in and use **Back to…** to return. The native workbench supplies placement, tabs, splitters,
Chat and dismissal. Opening twice selects the existing pane. Placement is per session and device; opening it
never creates a shared View or an artifact.

## Projections and evidence

- **Sessions** starts at the current conversation's session. Its inspector shows main, branch and reported child
  conversation locations grouped by resolved worktree, related registered worktrees and recorded previews.
  Groups collapse recorded children into compact name/glyph/age rows. Working frames use actual busy conversation
  IDs; child failure uses its reported failure, never its parent's worker error. A recorded child is not proof of
  an active worker or a completed task. Original cwd and environment remain available in tooltips.
  A related archived session can be inspected as historical context without restoring it.
- **Worktrees** lists every registered tree in the known repository scope, including trees without located sessions
  and trees shared by several sessions. Scope is configured project places, known conversation locations and
  explicitly declared served locations—not a recursive host search. Missing/locked/prunable registrations remain
  qualified. No located session never means unused or safe to delete.
- **Previews** lists existing p2 forwards, optionally configured Infra leases/static routes and explicit owner declarations.
  Records without a URL appear only under an unlinked-records disclosure.
  A session-only attribution never assigns a preview to that session's current worktree. A worktree association
  requires a recorded served location and a matching local repository identity. Registry owner labels and titles
  are never identities. Unknown associations stay unknown.

Known local paths use realpath and deepest segment-boundary containment; a different nested repository is excluded
by a common-directory identity check. Original paths stay visible. Remote inspection is unavailable: this pane
never connects to SSH. There are no source-file content reads, diffs, recursive filesystem scans, probes, Git mutations,
cleanup actions, process controls or route changes.

Metadata and repository observations are cached within the server object's lifetime, with each cache capped at
128 successful entries. **Refresh** rereads the
selected scope; **Cancel** abandons its reader without cancelling another device's shared read. Activity/title
changes do not run Git. Failed reads retain the last successful result and its timestamp with a visible failure.
Preview expiry advances while the pane is open; expiry says nothing about whether the route's process stopped.
Registered links are never inferred healthy. One help label explains that no health checks run.

Ages reuse the native sidebar formatter and minute clock. Session ages use session-wide indexed Catalog activity (including children and location moves); child ages use the
reported newest-message timestamp. Main/branch conversation ages remain unknown without a per-conversation timestamp.
Worktree/group ages are the latest associated supplied activity event, never filesystem modification or observation
time. Preview ages require an explicit `event` (`kind`: `created`, `updated` or `touched`; `at`: epoch milliseconds).
Unknown ages stay absent. Exact event/date is available in the age tooltip and the `<time>` element.

## Optional preview metadata

Without configuration, only existing p2 forwards are read. Configure other sources in the private
`<P2_DATA_DIR>/work-context.json`; changes are read on **Refresh**, not watched. This file is not `settings.json`.
No provider is reconciled or modified.

```json
{
  "infra": {
    "registry": "/home/me/.local/state/infra/previews/registry.json",
    "domain": "preview.example",
    "routes": {
      "file": "/home/me/infra/traefik/dynamic/routes.yml",
      "routers": ["ui-preview", "published"]
    }
  },
  "previews": [
    {
      "id": "ui",
      "name": "UI",
      "url": "https://ui.preview.example/",
      "session": "explicit-session-id",
      "location": { "env": null, "cwd": "/work/ui/apps/web" },
      "note": "Served directory explicitly reported by its author."
    },
    {
      "id": "published",
      "name": "Published site",
      "url": "https://published.preview.example/",
      "session": "author-session-id",
      "nonExpiring": true,
      "access": "Private Tailnet",
      "note": "Published immutable release; not served from the authoring worktree."
    }
  ]
}
```

Both `infra` and `previews` are optional. The read-only Infra adapter accepts only its version-1 lease registry
(`version: 1`, `leases` keyed by preview name, with `owner`, `purpose`, `port`, `paths`, `prefixes`, `expires_at`).
`expires_at` is epoch seconds. An unavailable or unsupported configured registry reports a failure, not an empty
successful inventory. Optional `infra.routes` reads only the configured canonical routes file and explicit router
IDs. Only a literal Host under the configured domain, a single `pitailnet` entrypoint and loopback HTTP(S) upstreams
qualify. Absent routers are absent registrations. Static routes have no expiry; their file times are not preview ages.
No generated proxy projections, secret files, other directories or hosts are searched.

Declare a URL once, with a unique stable `id`. An exact normalized URL joins a declaration to an existing provider
record, retaining that provider's expiry/access facts. Other URL matches, titles and ports are not guesses.
`session` is optional explicit attribution; `location` is the actual served cwd, not the author's current cwd.
Omit it when unknown or when publication is unrelated to a worktree. Every observed session sharing an explicitly
associated worktree can see that preview as related; this does not transfer session ownership.

For a standalone declared link, `expiresAt` is optional epoch milliseconds; alternatively `nonExpiring: true`
records an explicitly nonexpiring route. Omit both when unknown. HTTP(S) URLs cannot contain credentials.
Do not put secrets in URLs or notes. `access` is descriptive evidence, not authorization.

## Ownership and privacy

- Catalog owns sessions/branches and their location; Projects owns places; ChildStore owns reported child locations;
  StatusStore owns reported conversation activity. Reading this inventory never starts session workers.
- ForwardStore owns existing p2 forwards. Infra owns its lease registry. The owner owns explicit declarations.
  The pane observes metadata only and does not invent ownership or health.
- The server owns ephemeral repository observations and caches. The device owns placement/selection only;
  inventory, filters and preview data are not written to browser storage.
- Owner authorization is checked on binding and every request. Scope identifiers must still be known. The additive
  version-3 contract accepts the already-applied version-1 and version-2 readers; the new UI never asks for Git status.
- Launcher and rendering require live owner Access and connectivity. Private panes have no `data-view-pane`,
  selection/annotation/ink/frame capability, shared Views inventory or composer-context entry. Revocation unmounts
  them. Private component failures render a generic retry message without forwarding private error text to telemetry.

## Direction and validation

THESIS: A linked work-awareness inspector inside native p2, not another sidebar, dashboard or Git administration UI.

OWN-WORLD: Reuse native navigation rows, typography, muted tokens, project/place glyphs and working marks. No new
palette, cards, icon library, illustrations or independent design system.

STORY: Pick a session, worktree or preview; follow its evidence-backed relationships without losing the current
conversation. Unknown, stale and expired remain distinct.

FIRST VIEWPORT: Three equal projections, native filter and refresh, index plus inspector. Narrow panes drill in
with a visible back action. Native placement and motion stay unchanged.

FORM: Owner-pinned B · Linked inspector, code-led extension of the incumbent UI. No shipping raster assets.

FINISH: Validate actual desktop and 390px rendering, native row/glyph parity, links, shared/unoccupied trees,
explicit/unknown previews, owner revocation, guest exclusion and capture/annotation/context isolation. Run focused
real-Git/faux-provider/browser tests and both root and p2 checks before applying. Remote inspection and preview
health checks remain deliberately unavailable.
