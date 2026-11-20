# Artbin

Artbin is the game asset archive at [artbin.jackharrhy.dev](https://artbin.jackharrhy.dev). It accepts game assets, organizes folders, generates image and BSP previews, and serves the Artbin CLI. This workspace preserves Artbin's existing name, visual system, routes, and production URL.

## Entry points

`server.ts` starts the Node HTTP server. `app/router.ts` defines Remix routes and middleware, `app/assets.ts` serves browser modules, and `app/ui/` owns the visual system. `/cli` documents the Artbin CLI for visitors; its public guidance matches `apps/artbin-cli/README.md`. `/dev/kitchen-sink` is the live component reference. `src/db/` and `drizzle/` own the SQLite schema and migrations. `src/lib/` owns storage and processing. The CLI lives in `apps/artbin-cli`; shared scan and upload code lives in `packages/artbin-core`.

## Local setup

From the Tea root, run `npm ci`, then `npm run artbin:dev`. Node 26 LTS (26.13.0 or newer), ImageMagick, OpenSSL (for the local CLI HTTPS test), and Playwright Chromium are needed for all preview paths. Local development uses an administrator account unless `ARTBIN_REQUIRE_AUTH=1`. Set `ARTBIN_DB_PATH`, `ARTBIN_PUBLIC_DIR`, and `ARTBIN_TEMP_DIR` to use separate local data paths; defaults are `data/artbin.db`, `public`, and `tmp/uploads`. See `.env.example` for Jack Auth settings. Set `AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_PROJECT_ID`, `AUTH_ORGANIZATION_ID` and the resource server's `AUTH_INTROSPECTION_CLIENT_ID` / `AUTH_INTROSPECTION_SECRET`. Production uses `ARTBIN_URL=https://artbin.jackharrhy.dev`. Browser and CLI callbacks are `/auth/callback` and `/auth/cli/callback`. After CLI sign-in, select **Continue to CLI** in the browser to deliver the one-use handoff to the local listener.

## Optional browser origin

Set `HARRHY_ARTBIN_BROWSER_ORIGIN` to a separate HTTPS origin to serve the browser on a second hostname. Keep `ARTBIN_URL` unchanged: the CLI OAuth and API, MCP, machine asset API, and support login stay on the canonical host. The browser signs in independently on each host; Artbin does not share cookies across hosts. An operator may link to `/login?moved=1` on the alternate origin to show a fixed sign-in notice. Artbin does not redirect the old host automatically. Local GET document bookmarks under `/folder/*` and `/file/*` resume after browser sign-in; their query parameters and fragments are not carried through. The alternate origin recognizes the fixed `moved=1` notice separately, including for signed-in visitors.

Before enabling, register the exact alternate `/auth/callback` with Jack Auth. At every ingress hop preserve the configured public authority in upstream `Host`; Artbin does not trust forwarded origin headers. Restrict direct backend access and use the canonical `Host` for ingress health requests. With this option enabled, other authorities return 421, except the internal BSP renderer's GETs for `/login` and `/assets/` at `ARTBIN_INTERNAL_ORIGIN` (or the existing loopback default). Use the same runtime and storage for both hosts.

## Checks and deployment

Run `npm run artbin:check` from the root or `npm run check --workspace @harrhy/artbin-app`. Install Chromium with `npx playwright install --only-shell chromium` first. The ordinary check includes `__tests__/ui-browser.test.ts`: an isolated temporary database/public/temp runtime, synthetic Tus upload, CSP-safe enhanced navigation, responsive local typography, dialog focus/Escape and no-script folder editing/deletion safeguards. It never uses production data or provider credentials. `Dockerfile` produces the Node image published by `.github/workflows/publish-artbin.yml`. Root `compose.yml` provides a local Artbin container. Production host configuration and data migration belong in the infrastructure repo; keep the database and uploads together when changing images. The container expects writable `data`, `public/uploads`, and `tmp/uploads` directories under `/app/apps/artbin`.

Artbin keeps its archive layouts, route navigation, storage behavior and browser workflows inside this app. `app/ui/primitives.tsx` adapts `@harrhy/ui/native` controls, fields, feedback and layout to existing Artbin call sites; `styles.ts` applies the shared Artbin semantic theme and recipes. Progress, table cells/rows, native Collapsible, breadcrumbs, route NavigationMenu links and Heading/Text parts also come from the package; app-owned wrappers preserve route data and archive composition. Unknown job progress stays indeterminate rather than displaying zero. Empty states and item layouts remain app compositions. Upload dialogs use the shared native Dialog inside the existing app-owned client entry. Native selects retain no-script editing, required validation and reset behavior rather than adopting the interactive Select. The document explicitly loads the package-owned [self-hosted fonts](../../packages/ui/fonts/README.md): Fraunces for display headings, IBM Plex Sans for body/UI, IBM Plex Mono for code/details. [Font notices](../../packages/ui/THIRD_PARTY_NOTICES.md) accompany the assets. No theme import downloads fonts. Artbin consumes the Tea map renderer through its public package entry points. Keep its preview behavior, visual assets, and component styles intact when updating the renderer.

Remix 3.2 assigns a fresh CSP nonce to each HTML document, including generated
styles, import maps, and the browser entry. HTML is private and no-store. The
policy permits same-origin media and the preview viewer's runtime style values.

## Central identity rollout

Stop Artbin and back up its SQLite database before applying the reviewed mapping
with Jack Auth's `scripts/link-consumer-identities.py --application artbin`.
The private manifest maps existing 4orm subjects to central subjects; it keeps
Artbin user IDs, asset ownership and folder ownership. Unknown identities and
collisions abort the transaction. Run this before starting the image that applies
`0006_central_identity.sql` and renames the identity column to `auth_subject`.
Never match accounts by username. A fresh database needs no legacy mapping.

The migration clears old browser sessions and CLI handoffs. Members sign in again
through Jack Auth; sessions last at most an hour and never outlive the central
identity proof. CLI handoffs remain single-use and cannot extend expired proof.
Browser and CLI OAuth attempts each keep their state and PKCE verifier in a
separate short-lived cookie, so opening another sign-in tab does not replace an
earlier attempt.
App access requires this project's `member` or `admin` role; administrator actions
use its `admin` role. The former global 4orm admin flag is not an authority here.

API machine tokens require this project's audience, its role claims and the
explicit requested role scopes for `assets-read` or `assets-content`. The Maps
service has only those two roles. MCP requires a human administrator, the `admin`
role scope and the mapped local administrator record. Protected-resource metadata
advertises the central issuer and full required scopes. `@harrhy/identity` verifies
tokens; local sessions, user records and authorization remain in this app.

`app/operations/catalog.ts` publishes the MCP tool schemas. Every input has an
object root, including the folder-management and import unions; their branch and
confirmation constraints remain intact. The workspace check validates the complete
catalog with the MCP SDK and checks those unions against both published schemas
and operation validators.

`app/actions/mcp/controller.ts` authenticates each request and validates its origin
before passing it to `@harrhy/mcp`. The official SDK owns modern protocol
handling and native stateless compatibility with existing 2025 clients. The MCP
body limit is 8 MiB (including JSON/base64 overhead for the existing 5 MiB upload
limit), with a ten-second input deadline. Tool execution, confirmation, local
administrator checks and logging remain app-owned. SDK request handlers expose
the existing catalog directly, keeping operation validation and error messages in
one place rather than registering a second set of tool validators. Protected-resource metadata,
issuer and scopes are unchanged. Router tests exercise the same endpoint with
both the current native SDK client and Executor's exact SDK 1.32.1 client.

## Support login

Artbin contains a separate, disabled-by-default support login adapter. The
`/auth/support/start` and `/auth/support/callback` routes use Jack Auth's
one-use, PKCE-bound support handoff; they never create or update an Artbin user.
The target must already have an exact `users.auth_subject` row. The support
token must be a signed native token with the human actor in `act`, an active
resource introspection result for the same target and dedicated support client,
the Artbin project audience and the target's organization-qualified `member` or
`admin` role claim. Native acted JWTs omit `scope`; ordinary browser scopes are
checked on the same token's resource introspection result. This browser check does
not change CLI, machine API or MCP role-scope rules.

Support sessions are held in this Node process for at most ten minutes. Each
support request checks both Jack Auth support status and native introspection
again; an unavailable check denies access. Restarting Artbin invalidates every
support session. A surviving support cookie blocks ordinary-session fallback;
browser navigation goes to `/auth/support/recover` for an explicit
CSRF-protected exit after restart. Exit returns to an existing Artbin session or
starts Jack Auth sign-in when none exists. A rejected callback clears its transaction
cookie and redirects to a code-free problem page; an unlinked local target is
identified there without creating an account. Jack Auth can call the
transport-credential-protected `/auth/support/eligibility` endpoint before starting a
handoff to check whether the target's immutable subject has a local Artbin row;
lookup failure must deny the start.
Callback failures log only the failed verification stage and cleanup state,
without codes, tokens, subjects, callback URLs, or provider response bodies.
The banner names the actor and target, and its exit button ends only the
support session. Normal actor login remains separate. The Auth
service owns durable expiry and native token revocation if Artbin restarts or an
exit request cannot reach it. Mutation logs include actor and target references.
Initial acceptance must make no content changes.

`npm run test:support:browser --workspace @harrhy/artbin-app` additionally runs
Chromium through the recovery form and normal router middleware with synthetic
cookies and an ephemeral loopback HTTP server (no provider or production requests).
Install Playwright Chromium first. Ordinary checks keep this browser probe opt-in.
Support status rejection logs contain only `http`, `inactive`, `identity`, or
`expiry` branch codes; exit rejection logs distinguish `origin` from `csrf`.
They never contain header values, cookies, tokens, subjects, or support references.

Keep `ARTBIN_SUPPORT_LOGIN_ENABLED=0` until the matching Jack Auth support
endpoints, dedicated confidential client, transport credential, native policy
and isolated consumer acceptance are ready. The private production configuration
will need `AUTH_SUPPORT_CLIENT_ID` and a distinct
`AUTH_SUPPORT_TRANSPORT_SECRET`; do not reuse the resource introspection secret.
Set `AUTH_SUPPORT_ORIGIN` to the Jack Auth support HTTP origin; the native
`AUTH_ISSUER` remains the authority for signed tokens and introspection.
