# Sluggers design cookoff

Private experimental workbench at `/sluggers-lab?concept=pennant-veranda&screen=matchday`. This is an owner-authorized design comparison, not twelve new production theme APIs or a replacement for the original historical runtime.

## Entry points and locality

- `page.tsx`: one canonical set of Match day, Box score, Lineup & field, and Player catalogue renderers. Native shared controls/tables plus `@harrhy/ui/baseball` supply semantics. Switching concepts preserves selected data and changes actual full-screen styling; `concept` and `screen` are deep-linkable query parameters.
- `concepts/{pennant,channel,stadium,captain,dugout,festival}.ts`: one logical entry per experiment, containing semantic token overrides, visual part recipes and typed LabPartTokens and BaseballFieldPaint mappings. Shared structure does not branch on concept names. `concepts/types.ts` is the small recipe contract.
- `model.ts`: canonical archive view types, standings derived from finished match totals and conservative unknown-aware stat aggregation. There is no app client, parser, upload, save or network mutation.
- `../lab.server.tsx`: opt-in route registration and fixed curated asset manifest. Server-only filesystem access never enters a browser bundle.
- `../../../../../__tests__/sluggers-lab.test.e2e.ts`: synthetic-only route privacy, allowlist, keyboard, complete data and responsive checks. No original data/artwork is committed for tests.

## Original palette and circle backdrop

`original.ts` records the original app's blue ramp, sampled from its live OKLCH values into sRGB: blue-400 `#2b70df`, blue-500 `#2165da`, blue-600 `#1d56bf`, blue-700 `#1948a5`. This is app-local presentation, not a change to shared `sluggersTheme` or other consumers.

The original `app/app.css` uses blue-600 behind two repeating radial gradients: white at 2.5% opacity, `40%` then `transparent 21%`, 7rem tiles (112px in the verified original browser), offset by half a tile (56px). Its `#bg-gradient` masks the dots through the top 70dvh; its commented animation is intentionally inactive. The preview restores those exact observed dimensions and opacity, not an approximate image or oversized decorative circles. All six concepts share this original canvas and ramp while retaining their own density, radii, panel gradients and layout proportions. The original six retain opaque data panels. Three of the six offspring deliberately reveal the original circles through tinted data panes; their composited text contrast is checked against the brightest dot and every ancestor gradient stop.

Browser regression checks pin the source-faithful canvas, two staggered circle layers and lack of animation across all six concepts and four viewport widths. A bounded contrast check covers brightest gradient stops, button overlay, status ink and the brightest dotted canvas; it is not WCAG certification.

## Six offspring, original six preserved

The original entries remain unchanged. Each new file imports its Pennant or Dugout parent, composes only its own token/part overrides, and supplies a bounded recipe; no screen renderer forks on these IDs.

<!-- prettier-ignore -->
| New concept | Parent | Material and composition |
| --- | --- | --- |
| Pennant Veranda | Pennant Park | Original unblurred steel tint, broad side-by-side windows and rounded fixtures |
| Pennant Broadcast | Pennant Park | Opaque gradient board, dominant scores, narrow standings and four-column portrait shelves |
| Pennant Canopy | Pennant Park | Light 3px frosting, full-width shelves, three-across fixtures and capsule portraits |
| Dugout Frost | Dugout Link | Stronger 6px frosting, compact single-column records and fine keylines |
| Dugout Ledger | Dugout Link | Opaque ruled stack, square fixtures and horizontal desktop player records |
| Dugout Pocket | Dugout Link | Opaque centered 1080px shell, stacked screens and rounded compact chips |

Actual original source uses `cell-gray` at 30–40% opacity with thin tinted borders and **no backdrop blur**, verified in its running browser. `originalSteel` records its sampled `oklch(57% .07 262.2)` color. New 3px/6px blur is explicitly an experiment, not a claim of original behavior. The glass variants add a cobalt glaze to keep colored result text readable, and preserve opaque heading strips and controls. `LabPartTokens.panelSurface` and `panelFilter` are optional local roles; existing entries default to their original surface and no filter. Unsupported `backdrop-filter` and `prefers-reduced-transparency: reduce` yield opaque blue panes only for translucent variants. Browser tests exercise the reduced-transparency fallback.

## Private activation

Default off: neither `/sluggers-lab` nor its image route is registered, and no private corpus is read. Explicit `HARRHY_UI_SLUGGERS_PRIVATE_REVIEW=1` enables the page. `HARRHY_UI_SLUGGERS_REVIEW_DIR` optionally selects its provisioned directory, default `/home/jack/.local/share/sluggers-lab`; never point it at a backup, production volume or home directory. It must contain curated `corpus.json`, `manifest.json` and `assets/`. Asset requests match a narrow filename pattern and an exact manifest key; adjacent files and arbitrary paths are not served. Private responses are `no-store`.

`HARRHY_UI_SLUGGERS_PRIVATE_FONTS=1` separately enables already-provisioned private font-face declarations. No licensed binaries or original data/images are committed, embedded in public JavaScript, added as package dependencies or placed in a public image. The private directory lives outside the source checkout. The normal public workbench and its safe synthetic Sluggers scenes remain usable without either flag.

## Data truth and rights

Current private corpus was selected in one `BEGIN TRANSACTION READ ONLY` transaction from the existing **sanitized** `sluggers-old-preview` database. Explicit projections: 10 teams, 120 players, 13 match days, 65 matches, 900 frozen appearances and 360 stat rows. No user/account table, identifiers, credential/session fields, free-text trade content, video URLs, raw database cluster or original backup was read for this export. Team identity, public character names and actual totals remain authentic. No historical application or database was changed.

The archive has no per-inning run table. The scoreboard therefore displays nine inning columns as unknown, with actual authoritative run totals; it does not fabricate innings to make the design look full. Missing stats stay unknown and recorded zero stays zero. Pitching uses whole innings plus recorded outs. Archived current lineups and frozen match appearances are deliberately separate.

Curated private artwork: original source headshots/logos and three owner-pointed kitchen-sink game screenshots. Missing original image paths render letter markers; they are not replaced with unrelated portraits. Every copied asset has a private manifest source path. Original Nintendo/game image and private font rights remain unresolved: owner permission for private review is not redistribution clearance.

## Directions and references

Six blue-background, light-text concepts: Pennant Park (integrated broadcast gradients), Clubhouse Channel (cyan-blue clarity), Daylight Stadium (open blue scoreboards), Captain’s Club (rounded royal-blue clubhouse), Dugout Link (compact blue utility), Superstar Circuit (rounded exhibition framing). They differ in panel materials, border geometry, control treatment, type roles, density and layout proportions, not only hue.

Primary visual evidence is the owner's original game's `/kitchen-sink`: batting/field-position selection, match-stat scoreboard and main menu. Three screenshots are visible in the private page's collapsed reference gallery. Additional research and license findings belong in `RESEARCH.md`; no third-party retro UI library is installed.

Check from repository root:

```sh
npm run check --workspace @harrhy/ui
npm run check --workspace @harrhy/ui-app
```
