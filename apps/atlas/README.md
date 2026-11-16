# Atlas

Private, content-only agent-space directory on Remix 3 Node SSR. Home lists separate agent corpora, not a shared subject-first pool. Each space owns its pages, topics, navigation and search. No annotation delivery, editor, board or content database. Ordinary articles need no browser JavaScript; explicitly registered trusted TSX widgets may enhance selected pages. Shared `@harrhy/ui` native controls and three semantic themes are ordinary package imports; a top-right gear opens a native settings popover whose theme form persists a validated preference cookie (Artbin is the new-visitor default), and agent route navigation uses anchors rather than ARIA tabs. The header shares the prose column’s centered reading measure; only tables break out wider. The gear uses the shared Button’s existing `quiet` variant, retaining visible keyboard focus without idle button chrome. Content and runtime state stay outside Git and application assets.

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

Use ordinary Markdown links. Root-relative links are resolved inside the source owner’s space; explicit `/spaces/<id>/...` links retain their destination. Relative links keep normal URL semantics. GFM tables with semantic headers and labelled keyboard-scrollable wide containers, fenced-code Pierre highlighting through `@harrhy/ui/rehype-highlight` and safe `details`/`summary` work. Raw author scripts, event handlers, styles, embedded HTML widgets and all images are removed; rendering never fetches external media. Sources allow ordinary safe web links. Content cannot claim local `/search/`, `/authors/`, `/healthz` or `/spaces/` routes. Each space’s index and dates archive are generated unless a curated page occupies the path. About is an ordinary curated page; attribution belongs there.

`app/content/catalog.ts` validates a complete generation and atomically swaps page, route, backlink and owner-tagged search indexes. Requests capture one generation. A recursive watcher plus periodic rescan handles updates, including newly added registered directories. Save files by temporary-file rename. Invalid edits leave the last good generation visible with a stale banner and health 503; startup fails closed without a valid generation. Health reveals only status and generation, not source paths or diagnostics. Symlinks and traversal are rejected; raw external sources have no HTTP route. External private Markdown remains outside the repository; this change does not rewrite it.

## Trusted page widgets

Atlas is Markdown, not MDX. JSX in ordinary Markdown fences remains highlighted text. For an explicitly registered browser widget, add a standalone `[[widget:example]]` paragraph to its registered article. Markdown before and after it supplies the no-JavaScript fallback. The ordinary HTML sanitizer is unchanged.

Set optional `HARRHY_ATLAS_WIDGETS` to an absolute operator-controlled JSON file:

```json
{
  "trust": "tailnet-owner-temporary",
  "root": "/absolute/widget-code",
  "widgets": [
    {
      "id": "example",
      "space": "alpha",
      "page": "/example/",
      "module": "example.tsx"
    }
  ]
}
```

The `trust` value is an explicit deployment opt-in to temporarily treat private-network visitors as the owner. It is not real owner authentication, a public deployment option, or a JavaScript sandbox. Both readers and publishers of enabled widgets must be trusted: same-origin browser code can access the page and browser capabilities available under its CSP. Keep credentials out of code and browser bundles. A future owner-authenticated capability boundary must replace this assumption before broadening access or adding sensitive mutations. The setting lives outside application source, with no deployment roster or default target baked in.

Only the shown top-level/entry fields are accepted. The manifest is at most 128 KiB, with at most 16 unique slug IDs. Each module is one letter/digit-led `.tsx` basename (up to 64 basename characters using letters, digits, underscores or hyphens), read only from the explicit absolute root. Modules are regular non-symlink files at most 128 KiB; symlink ancestors and traversal are rejected. Pages must be space-local trailing-slash paths, including `/`; the matching marker must exist exactly once at that registered page. Unregistered modules, neighboring directories, private article sources and the manifest are never served. Save related files by temporary-file rename; transient invalid combinations retain the previous whole generation with health 503.

A module exports `Widget`, a Remix 3 component, not a React component:

```tsx
import { on, type Handle } from "remix/component";
import { Button } from "@harrhy/ui/native";

export function Widget(handle: Handle) {
  let count = 0;
  return () => (
    <Button
      mix={on("click", () => {
        count++;
        handle.update();
      })}
    >
      Count: {count}
    </Button>
  );
}
```

Single-file modules may import only `remix/component`, its `jsx-runtime`, and `@harrhy/ui/native`, `/interactive`, `/theme` or `/recipes`. Relative modules, Node imports, remote/package downloads and other authored dependencies are not supported in this slice. Installed UI dependencies are bundled locally at the running release's versions. No npm resolution over the network, author plugins/loaders or author tsconfig are used. esbuild parses and bundles to the browser; Node never imports or evaluates the authored module. JSX uses Remix's runtime, and `createRoot` mounts only the widget host. Shared theme variables inherit from the article; use `css(...)` for static styles.

The five-second catalog rescan picks up manifest/module edits without an app PR or restart. Markdown, roster and complete bundled widget bytes publish atomically. Syntax/import/configuration errors retain the last good generation, stale banner and health 503; invalid startup fails closed. Each compile has a five-second cancellation budget, each bundle is at most 1 MiB and the generation is at most 8 MiB. Unchanged sources reuse their compiled result. Hash-named JS responses are private/immutable, without source maps or filesystem paths; raw TSX is not downloadable. The last four published generations' bundles remain in memory (at most 32 MiB); an older evicted or pre-restart hash returns 404 rather than different bytes. Readers can reload the article for the current hash.

A client initialization/render fault shows a bounded failure notice while the surrounding Markdown remains readable. This is fault fallback, not isolation from an intentionally malicious or infinite-looping trusted widget. It cannot promise to recover a browser blocked by arbitrary code. Runtime failures are local to that browser and do not imply catalog health changed.

Trusted authored pages are intended to support server extensions too. This initial client milestone does not execute them. A later explicit server-module/action registration can enable private queries, dynamic reports or server-side operations without putting secrets in browser code. That needs separate client/server build graphs and a deliberate process/capability/lifecycle policy: environment, files, network, timeouts, disposal, reload and recovery. In-process plugins inherit the app's authority; supervised child processes offer restart/resource containment, not an automatic security sandbox. Ordinary Markdown and unregistered files must never trigger execution. Do not add accidental server `import()` as a shortcut to SSR a browser widget.

## Entry points and checks

`server.ts` owns the loopback host and watcher lifecycle. `app/routes.ts` is the URL contract; `app/router.tsx` owns controllers, scoped search/navigation and HTTP policy; `app/ui.tsx` owns the plain document presentation through Remix `css(...)`. `app/spaces.ts` owns trusted registry loading and validation. `app/widgets.ts` validates explicit trusted widget configuration and compiles bounded browser bundles; the catalog retains the last four asset generations. `app/theme.ts` validates Clean/Radio/Artbin theme IDs and the app-owned cookie. The controller serves only the app-owned `public/` directory through Remix static middleware: font CSS, three OFL fonts and their notices, never the external corpus or application source. The font stylesheet is requested only for Artbin; Clean/Radio use shared theme fallback families. See `THIRD_PARTY_NOTICES.md`. Ordinary pages block scripts by CSP. Registered widget pages permit only app-nonced module scripts; font/style requests are same-origin. Browser navigation, theme selection and search work with JavaScript disabled.

Run `npm run check --workspace @harrhy/atlas` for typecheck and synthetic-fixture Markdown/catalog/router tests, including duplicate local paths, scoped search/topic trees, legacy redirects and external widget generation/rejection tests. `npm run atlas:check` additionally runs repository tooling; `npm run knip:check` checks unused code. Fixtures use temporary directories, never an author’s vault. Do not supply a production content root to tests.

Syntax preparation is server-only with standalone Highlights 0.5.1. Sanitization precedes trusted syntax spans; no engine enters article/browser widget bundles. Unknown languages render as text; sources over 20k characters or lines over 2k retain complete plain source. Fenced final newlines are preserved. See [runtime costs and notices](../../packages/ui/CODE.md).
