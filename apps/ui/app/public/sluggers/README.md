# Sluggers workbench scenes

Four synthetic Sluggers compositions inside the existing `@harrhy/ui-app` Scenes interface. Mode: Operate / Read. Owner approved the blue scorebook proposal, original fonts and screenshot comparisons with the old UI. No production app, backend, upload/parser, Auth client or storage is initialized.

## Entry points

- `scene.tsx`: `SluggersScene(handle: Handle<{theme: string}>)`; Standings, Box score, Lineup and Tracker review with local scenario controls.
- `fixtures.ts`: two leagues with overlapping Fireballs names and distinct IDs; conference standings, nine-character lineup, frozen appearances, validation and stat formatting.
- `theme.ts`: shared `@harrhy/ui/theme` Sluggers tokens via `themeStyles(sluggersTokens)` and app-owned sports layouts. Sluggers is also selectable throughout Explorer.
- `fonts.css`: scene-only optional private original type roles; binaries are not committed.
- `../../../__tests__/sluggers.test.ts`, `sluggers.test.e2e.ts`: fixture arithmetic, unknown/zero, frozen history, tenant context, keyboard reorder, validation/error/retry, publication confirmation/focus and responsive bounds.

Open `/?view=scenes&scene=sluggers&theme=sluggers` for the full Sluggers workbench, or `/?component=button&theme=sluggers` for standard components. Clean/Radio/Artbin remain independently selectable. Local view/scenario state resets on reload. League changes reset lineup/review fixtures. Meaningful team actions open the corresponding synthetic lineup. Match start freezes appearances independently of later team edits.

Use existing app setup and checks:

```sh
npm ci
npm run dev --workspace @harrhy/ui-app
npm run check --workspace @harrhy/ui-app
```

`HARRHY_UI_SLUGGERS_PRIVATE_FONTS=1` opts the server into private font-face declarations for hydrated theme switching; binaries download only when a rendered Sluggers family is used; default off means no missing-font requests in public checkouts/CI. Do not enable without privately provisioned fonts. Existing source watcher and asset mounts serve these local compositions; no second framework, component explorer or asset server is added.

## Source and visual consistency

Reference: `jackharrhy/sluggers-super-draft` at `3c6013531c304c82f1a6bf741c833479b9621416`, inspected in this task worktree's ignored `tmp/sluggers-super-draft`, not another agent's clone. Original React Router 7 / React 19 code is reference, not a Remix 3 implementation template.

- Original `app/app.css`: blue league field, white ink, NewCezanne UI, Rodin statistical numerals and expressive display lettering. Local theme retains those roles, original blue-600 canvas and stationary 7rem dotted field, with compact translucent blue-gray tables, white identity text, green/red result figures and yellow score/focus accents; no opaque white score sheets. The dots are source-derived identity, not a new dashboard texture; no background animation.
- `app/routes/home.tsx`: PopHappiness league masthead; local masthead uses that family rather than approximating with a system face.
- `app/components/StandingsTable.tsx`: conference/team identity, W/L, win-loss difference, run differential and weekly results. Local fixture uses the same core standings metrics. Its Rodin numeric/identity role is retained; match scores use Cezanne as in original `routes/match.tsx`. ITC Bolt was an archive kitchen-sink specimen, not the product's general heading face.
- `app/components/Lineup.tsx`: captain, batting order and nine defensive locations; compact local ordered rows expose all nine without drag dependence. A pale diamond with live text markers echoes the original field geometry without copying character portraits or team logos.
- `app/utils/matches.server.ts`: `freezeMatchLineups` on transition into live play. Frozen fixture appearances never follow editor mutations.

No legacy React hooks, dnd-kit, tracker source or production data were ported. Nintendo/team artwork remains unprovenanced and absent; character names and team identity text are explicit placeholders, not invented licensed portraits.

## Private font provenance

Owner explicitly requested original fonts for private review while rights are resolved. This is not license clearance or authorization for public redistribution. Font binaries stay local/ignored, not committed or pushed into public Harrhy; no remote font requests. Source-only consumers use system fallbacks.

All inputs come from the pinned original app's `public/fonts/`. Converted using FontTools to WOFF2 and subset to U+0000–024F, U+2000–206F and U+2190–21FF with layout features retained.

<!-- prettier-ignore -->
| Private output under `fonts/` | Original filename | Role |
| --- | --- | --- |
| `cezanne.woff2` | `FOT-NewCezanne Pro M.otf` | Body, controls |
| `rodin.woff2` | `FOT-NewRodin Pro EB.otf` | Tabular statistics, identity headings |
| `bolt.woff2` | `ITC Bolt Bold Regular.otf` | Optional archive display specimen/fallback, not general product headings |
| `happiness.woff2` | `FOT-PopHappinessStd-EB.otf` | League masthead |

## Behavior and integration boundaries

The shared Sluggers theme supplies standard component colors, density, typography and table treatment; sports layouts alone remain local. Existing native Table/Heading/Badge/Field/Button/Notice/Checkbox and official Select/native Dialog cover these scenes. Scoreboard, conference grouping, stat semantics and reorder/import transitions remain app-owned; no shared sports component framework or package API change.

Tables have named, focusable scroll regions. Keyboard reorder retains focus on the moved character (including first/last boundaries) and announces its new position. Pending saves guard repeat dispatch and prevent context changes; failure retains edits. Captain must belong to the lineup and defensive assignments must be unique. Frozen box scores distinguish recorded zero from unknown (`—`); pitching innings are formatted from outs, not decimal arithmetic.

Select editing requires hydration. It does not provide native required validation, no-script choice editing or reset synchronization; Sluggers validates values and remounts default-initialized Selects on reset. Public standings/table HTML remains readable without scripts; interactive examples are not a no-JavaScript production form implementation.

Import review is prepared fixture interpretation, not a parser or uploader. Home/away and character mappings must resolve, replacement must be acknowledged, then an explicit Dialog confirmation names the tenant/match and consequence. Escape/cancel changes nothing; publication/failure are simulated and never mutate real standings. Raw logs/uploads are not exposed. UI tenant IDs and read-only presentation are not server authorization proofs.

HarrhyUI owns shared scene registration/navigation and private font-link opt-in in `app/router.tsx` and `app/public/scenes.tsx`; Sluggers owns this directory and agreed Sluggers tests. Production tenant constraints, OIDC, permissions, schema, migrations, tracker ingestion and deployment remain later work under root `SLUGGERS.md`.

## Evidence and delivery

Browser evidence is reviewed at 390/768/1440px for all four views, plus keyboard interactions, long names, full roster, empty/scheduled/incomplete/zero/error states. Compare against the pinned old UI; distinguish original-component synthetic renders from production screenshots. Private fonts must actually load, not merely appear in CSS. Screenshot notes and owner-review documents are native private artifacts, never absolute-worktree Markdown panes.

Automated checks do not establish screen-reader or WCAG conformance. Rights to original fonts/artwork remain unresolved; private font review is not a production distribution decision.
