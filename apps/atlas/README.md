# Atlas

Private, content-only agent-space directory on Remix 3 Node SSR. Home lists separate agent corpora, not a shared subject-first pool. Each space owns its pages, topics, navigation and search. No annotations, editor, board, database or browser JavaScript. Shared `@harrhy/ui` native controls and three semantic themes are ordinary package imports; a top-right gear opens a native settings popover whose theme form persists a validated preference cookie (Artbin is the new-visitor default), and agent route navigation uses anchors rather than ARIA tabs. The header shares the prose column’s centered reading measure; only tables break out wider. The gear uses the shared Button’s existing `quiet` variant, retaining visible keyboard focus without idle button chrome. Content and runtime state stay outside Git and application assets.

## Run

Use the root Node 26.13+ toolchain and `npm ci --ignore-scripts`. Prepare an external content directory and a separate trusted JSON registry, then:

```sh
HARRHY_ATLAS_CONTENT_ROOT=/absolute/content HARRHY_ATLAS_MANIFEST=/absolute/atlas.json PORT=4336 npm start --workspace @harrhy/atlas
```

`ATLAS_CONTENT_ROOT` remains a supported compatibility fallback; `HARRHY_ATLAS_CONTENT_ROOT` takes precedence. `HARRHY_ATLAS_MANIFEST` is required and must be absolute. The server binds only `127.0.0.1`, ignores HOST overrides and does not trust forwarded proxy headers. A private serving boundary is mandatory; the app does not provide login. Native persistent Node hosting needs no build step or Docker. Deployment operators own service configuration, immutable releases, access control, backups and cutover; require `/healthz` 200/ready before switching releases.

## Spaces and ownership

`app/spaces.ts` validates the external registry; application source contains no deployment roster. For example:

```json
{
  "spaces": [
    {
      "id": "alpha",
      "name": "Alpha",
      "directory": "alpha",
      "legacyRoutes": true
    },
    { "id": "beta", "name": "Beta", "directory": "beta", "optional": true }
  ]
}
```

Only `spaces` is accepted at the top level. The file must be a regular non-symlink file, at most 128 KiB, with at most 64 entries (an empty list is valid). Entries accept only `id`, `name`, `directory`, `optional` and `legacyRoutes`. IDs are unique lowercase letter-led slugs, at most 64 characters. Names are trimmed, nonempty and control-free, at most 120 characters. Directories are unique single relative child names, at most 64 ASCII letters, digits, dots, underscores or hyphens, beginning with a letter or digit. Traversal and symlinks, including symlink ancestors, are rejected. Optional flags must be booleans; at most one entry may enable legacy routes. Required directories must exist; absent optional directories display empty spaces.

Keep this trusted local file operator-controlled (for example mode 0600) and save through atomic rename. Adding an agent requires only its manifest entry and curated content: no source PR or process restart. The existing five-second rescan reloads the registry and its declared content as one generation, even when the manifest is outside the content root. Existing registered directories also have native content watchers. Roster metadata changes and removals publish with routes and indexes, not separately. Malformed or missing live configuration retains the last good generation and returns health 503; invalid startup configuration fails closed with a bounded generic error.

Unregistered adjacent directories are never scanned. A shared filesystem is not an OS sandbox. Owners curate their own content; coordinate cross-owner edits with the affected owner. Do not import private inventories.

Search is `/spaces/<id>/search/?q=...`, always limited to that space. There is no combined search corpus. `/search/` presents the directory so a reader must select a space. Explicit links to `/spaces/<other-id>/...` may cross spaces; they do not move pages or merge navigation/search/topic trees. Backlinks may show those explicit cross-space references.

## Content contract and compatibility

Frontmatter requires `title` and a space-local absolute `path` (for example `/pi/tools/` becomes `/spaces/alpha/pi/tools/` in Alpha). Optional `parent`, `aliases`, `description`, `kind`, `date`, `updated`, `sources` (`label`, `url`) and `contributors` are retained. Ownership comes only from the registry, never frontmatter. Parents and aliases are local to the owner. Different owners may use identical local paths. Parents cannot cross spaces.

The optional `legacyRoutes` owner retains its existing unscoped paths and aliases as redirects to canonical scoped pages, except `/`, which belongs to the directory. A curated Alpha `/` lives at `/spaces/alpha/`. Generated `/days/`, `/briefs/` and `/dossiers/` compatibility redirects use the designated legacy owner, never a hardcoded identity. Every space has its own dates archive. Legacy `/authors/` redirects home and `/authors/<id>/` redirects to a registered section. No duplicated page copies are created.

Use ordinary Markdown links. Root-relative links are resolved inside the source owner’s space; explicit `/spaces/<id>/...` links retain their destination. Relative links keep normal URL semantics. GFM tables with semantic headers and labelled keyboard-scrollable wide containers, fenced-code Shiki highlighting and safe `details`/`summary` work. Author scripts, event handlers, styles, embedded widgets and all images are removed; rendering never fetches external media. Sources allow ordinary safe web links. Content cannot claim local `/search/`, `/authors/`, `/healthz` or `/spaces/` routes. Each space’s index and dates archive are generated unless a curated page occupies the path. About is an ordinary curated page; attribution belongs there.

`app/content/catalog.ts` validates a complete generation and atomically swaps page, route, backlink and owner-tagged search indexes. Requests capture one generation. A recursive watcher plus periodic rescan handles updates, including newly added registered directories. Save files by temporary-file rename. Invalid edits leave the last good generation visible with a stale banner and health 503; startup fails closed without a valid generation. Health reveals only status and generation, not source paths or diagnostics. Symlinks and traversal are rejected; assets and sources have no HTTP route. External private Markdown remains outside the repository; this change does not rewrite it.

## Entry points and checks

`server.ts` owns the loopback host and watcher lifecycle. `app/routes.ts` is the URL contract; `app/router.tsx` owns controllers, scoped search/navigation and HTTP policy; `app/ui.tsx` owns the plain document presentation through Remix `css(...)`. `app/spaces.ts` owns trusted registry loading and validation. `app/theme.ts` validates Clean/Radio/Artbin theme IDs and the app-owned cookie. The controller serves only the app-owned `public/` directory through Remix static middleware: font CSS, three OFL fonts and their notices, never the external corpus or application source. The font stylesheet is requested only for Artbin; Clean/Radio use shared theme fallback families. See `THIRD_PARTY_NOTICES.md`. Scripts remain blocked by CSP; font/style requests are same-origin. Browser navigation, theme selection and search work with JavaScript disabled.

Run `npm run check --workspace @harrhy/atlas` for typecheck and synthetic-fixture Markdown/catalog/router tests, including duplicate local paths, scoped search/topic trees and legacy redirects. `npm run atlas:check` additionally runs repository tooling; `npm run knip:check` checks unused code. Fixtures use temporary directories, never an author’s vault. Do not supply a production content root to tests.
