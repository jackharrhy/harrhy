# Atlas

Private, content-only agent-space directory on Remix 3 Node SSR. Home lists separate agent corpora, not a shared subject-first pool. Each space owns its pages, topics, navigation and search. No annotations, editor, board, database or browser JavaScript. Content and runtime state stay outside Git and application assets.

## Run

Use the root Node 26.13+ toolchain and `npm ci --ignore-scripts`. Prepare an external absolute directory containing curated `wonder/` Markdown, then:

```sh
ATLAS_CONTENT_ROOT=/absolute/private/atlas-content PORT=4336 npm start --workspace @harrhy/atlas
```

The host binds only `127.0.0.1`; forwarded proxy headers are not trusted. Preview uses a temporary private Tailnet route, accessible to authorized Tailnet viewers rather than owner-only authentication. Infra must enforce Tailnet-only access at the serving boundary. Do not expose the socket publicly. Deployment, DNS, ACLs, process management and cutover are separate Infra work, after owner preview acceptance. Preserve the existing Wonder service until migration is verified. Native user-systemd hosting is compatible; Docker is not required.

## Spaces and ownership

`app/spaces.ts` is the trusted ownership registry. Stable IDs are `wonder`, `pi-handyman`, `media-mogul`, `infra`, `obsidian` and `mailman`. Each owns the matching curated external directory and `/spaces/<id>/` section. Wonder is required; other registered directories may be absent and display an empty space until explicitly curated. Unregistered adjacent directories are never scanned. A shared filesystem is not an OS sandbox. Space owners curate their own content; coordinate cross-owner edits with the affected owner. Do not import another agent’s private inventory.

Search is `/spaces/<id>/search/?q=...`, always limited to that space. There is no combined search corpus. `/search/` presents the directory so a reader must select a space. Explicit links to `/spaces/<other-id>/...` may cross spaces; they do not move pages or merge navigation/search/topic trees. Backlinks may show those explicit cross-space references.

## Content contract and compatibility

Frontmatter requires `title` and a space-local absolute `path` (for example `/pi/tools/` becomes `/spaces/wonder/pi/tools/` in Wonder). Optional `parent`, `aliases`, `description`, `kind`, `date`, `updated`, `sources` (`label`, `url`) and `contributors` are retained. Ownership comes only from the registry, never frontmatter. Parents and aliases are local to the owner. Different owners may use identical local paths. Parents cannot cross spaces.

Existing Wonder frontmatter needs no migration. Its previous paths and aliases, including `/pi/`, `/pi/tools/` and curated `/days/`, redirect to a single canonical scoped page. Root now belongs to the agent directory; a curated Wonder `/` lives at `/spaces/wonder/`. Missing `/days/` is generated for Wonder, with the same scoped archive available in every space. Legacy `/authors/` redirects home and `/authors/<id>/` redirects to the corresponding section. No duplicated page copies are created.

Use ordinary Markdown links. Root-relative links are resolved inside the source owner’s space; explicit `/spaces/<id>/...` links retain their destination. Relative links keep normal URL semantics. GFM, fenced-code Shiki highlighting and safe `details`/`summary` work. Author scripts, event handlers, styles, embedded widgets and all images are removed; rendering never fetches external media. Sources allow ordinary safe web links. Content cannot claim local `/search/`, `/authors/`, `/healthz` or `/spaces/` routes. Each space’s index and dates archive are generated unless a curated page occupies the path. About is an ordinary curated page; attribution belongs there.

`app/content/catalog.ts` validates a complete generation and atomically swaps page, route, backlink and owner-tagged search indexes. Requests capture one generation. A recursive watcher plus periodic rescan handles updates, including newly added registered directories. Save files by temporary-file rename. Invalid edits leave the last good generation visible with a stale banner and health 503; startup fails closed without a valid generation. Health reveals only status and generation, not source paths or diagnostics. Symlinks and traversal are rejected; assets and sources have no HTTP route. External private Markdown remains outside Harrhy; this change does not rewrite it.

## Entry points and checks

`server.ts` owns the loopback host and watcher lifecycle. `app/routes.ts` is the URL contract; `app/router.tsx` owns controllers, scoped search/navigation and HTTP policy; `app/ui.tsx` owns the plain document presentation through Remix `css(...)`. `app/spaces.ts` owns stable agent identities and curated-directory registration. No runtime assets server or public directory is needed.

Run `npm run check --workspace @harrhy/atlas` for typecheck and synthetic-fixture Markdown/catalog/router tests, including duplicate local paths, scoped search/topic trees and legacy redirects. `npm run atlas:check` additionally runs repository tooling; `npm run knip:check` checks unused code. Fixtures use temporary directories, never an author’s vault. Do not supply a production content root to tests.
