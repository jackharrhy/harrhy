# @harrhy/ref

A small, private board for images and links. It presents itself as Ref while retaining Ref's board format and storage contract. This app was adapted from the former standalone Ref repository and was inspired by [metalfinger/refboard](https://github.com/metalfinger/refboard). It uses Remix 3, a Worker, SQLite Durable Objects, native WebSockets, and R2-compatible image storage. Every approved member sees the same boards; there are no per-user spaces. The Newport production deployment runs this workspace's container image. The signed-out view contains only the `ref` wordmark and **Sign in** action, plus actionable errors when needed. Shared control styles come from [`@harrhy/ui`](../../packages/ui/README.md); Ref supplies its palette, board layout, and canvas presentation in `app/styles.ts`.

Jack Auth production sign-in uses `AUTH_ISSUER`, `AUTH_CLIENT_ID`,
`AUTH_PROJECT_ID`, `AUTH_ORGANIZATION_ID`, and
`AUTH_PUBLIC_ORIGIN=https://ref.jackharrhy.dev` together. Register the exact
public PKCE callback `https://ref.jackharrhy.dev/auth/callback`. An app
member/admin grant opens the shared boards; board and asset IDs stay stable.
The first Jack Auth grant is for Jack only; other users can be admitted later
without changing the board format.
Jack Auth sessions in `DirectoryCell` carry a subject and expire within one hour.
Old password sessions cannot authorize Ref. Local development uses the same OAuth
callback and subject-bound session code as production, with the disposable
[`@harrhy/dev-auth`](../../packages/dev-auth/README.md) issuer. The archive CLI
uses a delegated resource token.

## Run locally

Requires Node.js 26 LTS (26.13.0+) and npm. From the Harrhy root:

```sh
npm ci
cp apps/ref/.dev.vars.example apps/ref/.dev.vars
npm run ref:dev
```

Open <http://127.0.0.1:8787>. Select **Sign in**, then continue as the disposable local user. This runs authorization code with PKCE S256, signed ID-token verification, userinfo, and the ordinary Ref callback. The local issuer has its own test subject and grants; it cannot authenticate a production account. Create a board, then add images with the button, drag and drop, or paste. Add links with **Add link**, by pasting a URL, or by dropping one onto the board. Link cards show the complete preview image; select one for metadata and the original post. Drag a card to move it; select it to resize, rotate, or remove it. Scroll to zoom around the pointer by default. Toggle **Scroll: Zoom** to **Scroll: Pan** for two-finger trackpad panning; this preference is saved in this browser when storage is available. Hold Shift while scrolling vertically to pan horizontally in either mode. Ctrl/⌘-scroll and trackpad pinch always zoom. Drag the background or middle-drag to pan, or use the zoom buttons. With the canvas focused, Space-drag pans, Delete/Backspace removes the selection, and Escape clears it; these shortcuts do not apply in the inspector or form controls. On narrow screens, item details open below the board.

`.dev.vars` is ignored by Git. Wrangler stores local board and image data under `apps/ref/.wrangler/`. Newport's production data lives in a separate Celld store; local development does not share it. **Lock** ends the current Ref session. Stopping the local issuer invalidates its in-memory codes and tokens; Ref sessions expire within one hour.
`/health` is process liveness; `/ready` also reads the directory store so startup and crash-recovery checks wait until sessions can be served.

## How it works

- `worker.ts` requires Jack Auth configuration, validates the OAuth callback, and resolves an opaque subject-bound session cookie.
- `DirectoryCell` stores sessions and the board list in SQLite. Existing boards from the previous account-based version are copied into the single-user list on first access. Old account sessions no longer work.
- `BoardCell` stores items, link previews, and image metadata per board. It validates edits, writes them to SQLite, and broadcasts updates to every open tab with hibernatable WebSockets.
- Removing the last item that uses an asset reclaims its metadata and stored image. Failed object-store deletions are retried by a Durable Object alarm. The operation log keeps roughly 10,000 recent edits per board; retries older than that window are no longer deduplicated.
- `MEDIA` stores uploaded images and cached link preview images. Browser reads and uploads require a valid session. Image and snapshot reads also accept explicitly scoped board-read or archive-read bearer authorization.
- The browser keeps the current decoded image visible while a thumbnail or full-resolution replacement loads and decodes. Reversed zoom requests and failed replacements do not clear the current image.
- `app/assets/board.ts` is the browser editor. It uses DOM APIs, pan and zoom, uploads, optimistic edits, reconnect, and revision checks. No React, Express, or Socket.IO.
- Remix 3.2 supplies a fresh CSP nonce for each HTML response. Ref allows its same-origin scripts, thumbnail worker, board WebSocket, stored and external link images, validated X video media, and the three explicitly supported social embeds. Private HTML remains `no-store`.

Images may be PNG, JPEG, GIF, or WebP, up to 20 MB each. Link previews are best effort: blocked sites still save as URL cards, and Twitter, YouTube, or Instagram embeds depend on those services remaining available. Numbered X photo links use FxTwitter's post metadata to select the linked image; if that lookup fails, Ref leaves the card image empty rather than showing a different photo. X video links use a validated remote MP4 with a cached poster and native playback controls; Ref does not copy the video. Ref stores the title, description, and cached preview image, but not a full page archive. Select a link and use **Refresh preview** to update an older thumbnail-only card or retry a stale preview; the existing card stays in place if Ref cannot obtain usable replacement media. See [the Karakeep workflow notes](docs/karakeep-notes.md) for what this first version covers. The local issuer grants access only to the isolated development store; production uses reviewed Jack Auth grants.

## Checks

```sh
npm run ref:check
npm run test:images --workspace @harrhy/ref
```

`test:images` exercises the actual image loader in Chromium with delayed responses, rapid LOD reversal, failed requests, retries, and composited-frame pixel checks using synthetic images. It also runs as part of the browser smoke.

Harrhy CI runs the browser smoke against a temporary Wrangler store and the local OAuth issuer when Ref is affected on a ready PR or `main`. It does not add a test board to your local development store.

Ref also runs a production-style Celld check using an isolated SQLite object store and the local OAuth issuer. It runs the browser smoke and real MCP clients pinned to SDK 1.32.1 and 2.4.0, verifies browser broadcasts, revision conflicts and operation replay, kills Celld, removes its replica cache, then verifies persisted boards, links, WebSockets and last-use asset cleanup from the authoritative store. All writes use synthetic disposable state. CI extracts the Celld binary from the image selected by this app's Dockerfile. To run the same check locally:

```sh
CELLD_BIN=/absolute/path/to/celld npm run test:celld --workspace @harrhy/ref
```

## MCP

`POST /mcp` exposes Ref's shared boards through the official MCP SDK. Resource
metadata is at `/.well-known/oauth-protected-resource/mcp`. The app-owned
`app/mcp/` catalog and handlers use `@harrhy/mcp/native`; the SDK owns protocol
negotiation and transport, including existing SDK 1.32.1 clients. Requests are
bounded to 28 MB (allowing base64 for one 20 MB image). Browser session cookies
never authorize MCP.

A delegated token must represent a human, target the Ref project, and request
exactly one membership scope (`member` or `admin`) plus `boards-read` and/or
`boards-write`. Both the role grant and its matching scope are required for
every requested capability. Metadata lists supported alternatives, not a scope
bundle to request verbatim. These capabilities need reviewed Ref project roles,
user grants and Auth delegated-consent policy; browser membership alone does not
grant them. Archive scopes cannot be combined with board scopes. All approved
members share the same boards; MCP does not introduce per-user ownership.

<!-- prettier-ignore -->
| Tools | Capability | Behavior |
| --- | --- | --- |
| `boards_list`, `board_get`, `asset_get` | `boards-read` | Read boards, current item revisions and asset metadata; image URLs require authenticated reads |
| `board_create`, `board_rename` | `boards-write` | Create or rename shared boards; create retries can create another board |
| `asset_upload` | `boards-write` | Upload standard base64 image bytes; returns an asset to place separately; retries create another asset |
| `link_add`, `link_refresh` | `boards-write` | Use the browser's public-link preview/cache rules; refresh replaces saved preview metadata |
| `item_create`, `item_transform`, `item_remove` | `boards-write` | Use the same validated Durable Object operation path and WebSocket broadcasts as the browser |

Item writes require caller-generated UUID `operationId` values; creates also
require an `itemId`. Reuse the same operation ID only to retry that operation.
Transforms and removals require the current `baseRevision`; conflicts return an
error and, with read authorization, the current snapshot. Item removal reclaims
an asset only after its last use. The catalog explicitly marks removal and link
refresh as destructive. There is no board-deletion tool. Existing operation-log
retention bounds deduplication to roughly the latest 10,000 board edits.

`asset_upload` and `link_add` save resources; call `item_create` with their
`assetId` and complete geometry to place them. Network link previews remain best
effort. Write-only tokens cannot list/read boards or receive conflict snapshots.
The normal archive CLI and browser endpoints retain their separate authorization.

## Back up and restore

The archive commands require a short-lived delegated `REF_ACCESS_TOKEN` or a
private `REF_ACCESS_TOKEN_FILE`. For a local disposable archive check, use
`node packages/dev-auth/token.mjs /private/new-token-file` and point
`REF_ACCESS_TOKEN_FILE` to that file; remove it afterward.
Backup requires a Ref admin grant plus `archive-read` role and scope.
Restore requires the admin grant and both `archive-read` and `archive-restore`
roles/scopes; a browser cookie alone never authorizes archive routes. The
Worker introspects archive requests, board snapshot reads, and image downloads. Resource metadata
is at `/.well-known/oauth-protected-resource/api/archive`. Set `REF_URL` to
the instance you want to access:

```sh
REF_URL=https://ref.example.com npm run backup --workspace @harrhy/ref -- /safe/place/ref-backup
REF_URL=https://new-ref.example.com npm run restore --workspace @harrhy/ref -- /safe/place/ref-backup
```

The backup command creates a new directory containing `manifest.json`, uploaded images, and cached link preview images. It fails if that directory already exists or a board changes while it is being copied. Keep the directory private: it contains your board contents. Restore preserves board and item IDs, layout, link metadata, and image bytes. It verifies every file before changing the destination and reads the restored board and images back afterward. Run it against an empty instance; if a restore is interrupted, rerun the same command to resume. A destination with unrelated boards is rejected.

Archives contain the current board state, not edit history or full copies of linked web pages. Link preview images that were never cached still depend on their external URLs. Restore recreates item revision counters; clients should reload after a cutover.

With an original Ref checkout and Celld installed, run `npm run test:archive:source --workspace @harrhy/ref` to verify the transfer path. Set `REF_SOURCE_ROOT` to that checkout. This optional check creates a board with an image and link in disposable local source storage, backs it up with the original Ref archive command, restores it into a separate Tea Ref store twice, and compares the resulting archive. It does not read a live deployment or production data. The former local source checkout was removed after production cutover.

## Hosting

For a separate Cloudflare deployment, create the `tea-ref-media` R2 bucket and configure the Jack Auth browser and server-side introspection fields shown in `.dev.vars.example` with real reviewed values. The Worker is named `tea-ref`; it does not share the original Ref Worker or bucket. Use HTTPS on the public address and register its exact callback. [Cloudflare's secret documentation](https://developers.cloudflare.com/workers/configuration/secrets/) covers deployed secrets.

For a self-hosted runtime, [Celld](https://celld.dev/docs/) accepts this Wrangler configuration and can run it locally with `npm run dev:celld`. It reads `.dev.vars` for local development. A Celld fleet deployment needs the Jack Auth fields in private configuration; `celld deploy` does not read `.dev.vars`. See [Celld's deployment instructions](https://celld.dev/docs/) for storage and node setup. Use the archive commands before moving a production instance.

### Local container and production

The root `compose.yml` builds `apps/ref/Dockerfile`, serves `ref.localhost` with a separate `ref-data` volume, and starts the disposable local issuer at `ref-auth.localhost:8786`. Both use the same OAuth flow as `npm run ref:dev`; the issuer registration is exact to this local callback. Celld stores its authoritative SQLite object store under `/app/.celld/object-store/` and replicas under `/app/.celld/state/`; preserve the entire mount for backups. The `publish-ref` workflow builds and checks the app when Ref or its build inputs change on `main`, then publishes `ghcr.io/jackharrhy/ref:latest` and a commit tag. Newport uses `:latest` and Watchtower to deploy new main builds. See the infrastructure repository's `hosts/newport/ref/README.md` for its store and deployment path.

The Dockerfile pins the fork's Celld 0.6.2 image by digest. Its published binary matches the release binary used for Ref's browser and cold-restore smoke. Pass `--build-arg CELLD_IMAGE=<image>` to rehearse another runtime on an isolated store.
