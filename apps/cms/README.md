# TeaCMS

This Remix 3 Node app is the multi-site CMS. It selects sites by hostname and uses [`@harrhy/rich-text`](../../packages/rich-text/README.md), [`@harrhy/mcp`](../../packages/mcp/README.md), and other shared packages. Andrew and Luke each keep their presentation and assets under `sites/`, exported as `@harrhy/cms/sites/andrew` and `@harrhy/cms/sites/luke`.

`server.ts` starts the server, `config.ts` registers sites and origins, and `app.ts` connects each site to its router. `app/` owns routes, controllers, editor UI, storage, and assets; `createContentStore` and `createAuthStore` bind storage to a database. `operator/` owns the dashboard and `createOperatorStore`; `db/` holds SQLite migrations. Keep site code and assets in `sites/<id>/`.

## Admin UI

Operator and admin views use [`@harrhy/ui`](../../packages/ui/README.md) native controls and interactive compositions with the Clean theme. `app/ui/admin-theme.ts` composes the shared theme with locally hosted Inter and compact admin density. `app/ui/admin-*-styles.ts` and `operator/` keep CMS-specific layouts, media grids and editor geometry; their compatibility color variables refer to shared semantic tokens rather than a second palette. `public/fonts.css` contains only the Inter font faces.

Both the block editor and visual editor remain first-class. CMS owns editor state, rich text, block ordering, resizable previews, media/folder workflows, saving and publishing. Shared controls do not own these domain behaviors. Selections use the shared interactive Select through `CmsSelect`, including Luke navigation and adornment previews; changes and resets must keep its mounted selection consistent with the CMS document without remounting ordinary selections. Browser components run inside existing `clientEntry(...)` boundaries, and `app/assets.ts` explicitly mounts/allows their shared package graph.

`app/actions/public/visual-tools.tsx` is a shared-component editing overlay, scoped to its own Clean root. Public site rendering and live-preview content keep their site styles and never inherit the admin theme. Anonymous pages do not load the editing island. In visual-edit mode, site content stays inert until the editing island is ready, preventing pointer and keyboard activation during hydration. Preserve native Auth/session navigation, request nonces, field labels, focus behavior and keyboard resizing when changing these surfaces.

The Node host opens a request record through [`@harrhy/logger`](../../packages/logger/README.md). MCP handlers enrich that record. Request bodies, headers, and raw URLs are not logged.

Public HTML pages, including public pages on preview sites, support Brotli and gzip through Remix's response compression. Operator and editor routes, requests with cookies or authorization, and query variants are excluded. Pages still render from current published data on each request; this is not a page cache. Media and API responses retain their existing transport behavior.

HTML responses use Remix request nonces for scripts and generated styles, including the operator, editors, and public pages. They are private and no-store; anonymous public pages can still be compressed. Public pages allow the site's video embeds and enabled Google Analytics, while preview and CMS pages continue to suppress analytics.

## Develop

Use Node.js 26 LTS (minimum 26.13.0). From the repo root:

```sh
npm ci
npm run cms:dev
```

Checks:

```sh
npm run cms:check
npx playwright install chromium
npm run test:browser --workspace @harrhy/cms
```

Host tests and fixtures live in `__tests__/`; feature tests live in `__tests__/` beside their code. Operational scripts live in `scripts/`. See [Compose](../../compose.yml) and [operations](../../docs/cms/OPERATIONS.md) for deployment and data, [MCP](../../docs/cms/MCP.md) for the optional read-only endpoint, and [AGENTS.md](AGENTS.md) for CMS editing rules.

## App-owned backups

`backup/` owns the optional daily scheduler, SQLite/media snapshots, seven-generation
retention and private status receipts. Set `HARRHY_CMS_BACKUP_DIR` to a distinct persistent
mount (local Compose uses `cms-backups:/app/backups`). The authenticated operator
dashboard shows status; public health does not expose it. All configured site
DB/uploads/public trees and the optional operator DB are included. See
[backup configuration, consistency and offline restore](../../docs/cms/BACKUPS.md).
Database snapshots are individually consistent, not a cross-database instant.
Local snapshots are not off-host disaster recovery. The separate production Andrew
site and its legacy media are outside this app's backup scope.

## Auth transition

Native operator and site password logins are available only when Auth is not
configured. Enabling Auth rejects old password sessions and disables password
sign-in without removing user rows or content.
The first Auth cutover links only the operator. A site's Sign in button sends
the browser through the operator's Auth flow; the dashboard's Open editor button
uses an existing one-use, site-bound handoff to enter either editor without another
login. Set `HARRHY_AUTH_ISSUER`, `HARRHY_AUTH_PROJECT_ID`,
`HARRHY_AUTH_ORGANIZATION_ID`, `HARRHY_AUTH_OWNER_SUBJECT`, and the single public
`HARRHY_AUTH_OPERATOR_CLIENT_ID`, together with `HARRHY_CMS_OPERATOR_ORIGIN`,
to enable Auth mode. The only browser callback is `/auth/callback` on the operator
host. No tenant browser client settings are needed; old `/tea/auth/callback` routes
return 404. Existing unused tenant provider registrations remain inactive and are
not deleted. Initial Auth mode admits only the reviewed owner's immutable issuer
and subject.
The app requires an existing local user row with reviewed `auth_issuer` and
`auth_subject`; subject-only links are not adopted automatically. It never links
by email or creates an editor on sign-in. The owner pin applies to callbacks,
existing sessions, operator tickets, and MCP, even if another local user is linked.
The Auth registry remains held with `allowedUserIds: []` in source. Infra
must run the checked Auth image that enforces that field before releasing the CMS
hold in its reviewed runtime registry, with exactly the owner's ID in the list.
Keep other clients, Ref preview policy, grants, and application entries unchanged.
No Luke/Andrew enrollment or grant is enabled by this cutover. Exactly two native
registrations are needed: the existing operator browser client and existing MCP
resource client. The missing resource credential is renewed privately on that same
registration; no replacement client or additional grant is created.
Operator sign-in requires the CMS project admin grant and a reviewed local
issuer/subject link. Site editor access is inherited through site-bound operator
tickets, not a separately linked tenant account. Auth sessions expire
after one hour, and old password sessions are rejected as soon as Auth mode
is enabled. Login transactions are bounded, server-held, ten-minute and one-use,
bound to the browser cookie and exact host/client callback. A restart invalidates
pending sign-ins. Log out clears the local session.

Auth mode also replaces the shared read-only `HARRHY_CMS_MCP_TOKEN` with a human
CMS-admin resource token for the pinned owner (no acted or service tokens). Configure `HARRHY_AUTH_INTROSPECTION_CLIENT_ID` and
`HARRHY_AUTH_INTROSPECTION_SECRET` for that endpoint; the site resource metadata
is at `/.well-known/oauth-protected-resource/tea/mcp`. Production identity
links, provider grants, secrets and rollout belong to the Auth and Infra
owners, not this repository.

With the CMS stopped and backed up, apply a private mode-0600 reviewed link
manifest of `{ "issuer": "https://reviewed-issuer.example", "operator": [{ "id": 1, "subject": "..." }], "sites": {
"andrew": [], "luke": [] } }` for the initial operator-only cutover. Add
site links only after the corresponding local IDs and Auth subjects are
reviewed. Use the actual reviewed local IDs; the example operator ID is a
placeholder. First run `npm run link:central-auth --workspace @harrhy/cms --
/private/links.json` to validate every target without changing links, then
repeat with `--apply`. The command rejects unknown IDs, conflicting links,
duplicate subjects within a database, conflicting issuers, missing schema
migrations, and missing database files. The issuer migration is additive; normal
site database migration and operator-store initialization in the checked image
add `auth_issuer` without changing any existing identity link. Run that schema
initialization only against the reviewed existing database paths before the link
command; missing files must never be initialized as empty replacement tenants. It reports counts only. A retry with the same manifest is
idempotent. Keep the verified SQLite-and-media snapshot until production acceptance.

For rollback, restore the previous image and its complete previous environment
and Auth registry (including the CMS hold and Ref preview overlay). The additive
columns are compatible with the previous image; do not drop columns or erase
links/content. Reverting Auth mode restores the previous password-login behavior
and may reactivate old unexpired password sessions. If data recovery is required,
use the matching-image offline restore procedure, never copy a live SQLite file.
Infra owns this sequence and the bounded Watchtower rollout. Acceptance requires
one fresh sign-in by the owner, then operator access to both host-selected editors;
a synthetic browser test or source merge alone is not production acceptance.

The [CMS publish workflow](../../.github/workflows/publish-cms.yml) runs on `main` changes to this app or its shared dependencies. It checks the CMS and publishes `ghcr.io/jackharrhy/teacms:latest` plus a commit tag. It can also be started manually. Mug follows `latest` with Watchtower; the commit tag supports rollback.

### Selected Docker inputs

The Dockerfile installs only this app and its transitive workspace dependencies,
with manifests and `.npmrc` before source for dependency caching. It preserves
required inherited root configuration and whole selected workspace assets. See
[container policy and checks](../../docs/NODE-IMAGES.md) for runtime/compiler
exceptions and the production-image smoke commands.
