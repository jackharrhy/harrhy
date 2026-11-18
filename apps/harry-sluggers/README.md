# Harry Sluggers

Read-only Remix 3 website over the existing historical Sluggers PostgreSQL database. Home, players, teams and current lineups, match days, frozen match lineups and recorded statistics, events, public trade history and draft results are separate linkable pages. The six curated Sluggers themes remain selectable at the top of every page.

## Run and check

Use the root Node 26 toolchain and `npm ci --ignore-scripts`. Set `HARRHY_SLUGGERS_DATABASE_URL` through an external private environment file, then `npm start --workspace @harrhy/harry-sluggers`. Run `npm run build --workspace @harrhy/harry-sluggers` before starting to bundle the native Remix browser runtime. The native server binds loopback on `PORT` (default 18950); only the explicit container setting `HARRHY_SLUGGERS_HOST=0.0.0.0` enables a non-loopback bind. A private serving boundary is required; this app has no authentication. Run `npm run check --workspace @harrhy/harry-sluggers` and `npm run build --workspace @harrhy/harry-sluggers`.

Against a running authorized private preview, install Chromium with `npx playwright install --only-shell chromium` and run `npm run test:browser --workspace @harrhy/harry-sluggers`. `HARRHY_SLUGGERS_TEST_URL` optionally selects that preview. This exercises all page families, six styles and four viewport widths, checks native Remix navigation, player search and saved style selection. It reads public pages only and does not write league data.

The previous misspelled `HARRHY_SLEGGERS_DATABASE_URL`, `HARRHY_SLEGGERS_ASSET_ROOT` and `HARRHY_SLEGGERS_HOST` settings remain compatibility fallbacks while external preview configuration transitions. Correctly spelled `HARRHY_SLUGGERS_*` settings take precedence; database values are unchanged.

## Boundaries

`app/schema.ts` is read-only table metadata, not a migration. Never run migrations, seed, reset or wipe against the historical database. The operator must provision a dedicated column-granted SELECT-only role with no inherited write or privileged routine access, default read-only transactions and query timeouts. No owner credential is supported. Every page reads a consistent read-only transaction using explicit column projections (never SELECT *); only GET/HEAD requests are accepted. No account identifiers beyond safe display-name associations, authentication fields, private pre-draft choices, proposal/response text or arbitrary stored URLs are selected. No database URL or raw exception is returned to the browser.

Current team lineups are not substituted for frozen match appearances. Unknown scores/statistics remain unknown, never zero. Recorded results do not imply a complete season. Historical assets and fonts are not distributed: optional `HARRHY_SLUGGERS_ASSET_ROOT` serves only fixed player/team PNG names (`player-ID.png`, `player-side-ID.png`, `team-ID.png`) and four font names from an operator-curated private directory. No remote images or links are loaded from database values.

The Dockerfile builds a source-only image without credentials or historical assets. The opt-in Compose profile requires an externally supplied reader URL; no database is provisioned. The image workflow publishes immutable commit tags to GHCR without deploying anything.

Production deployment is separate from building and publishing an image. The original historical runtime and database remain untouched. Future schema restructuring and editing/drafting workflows are outside this app.
