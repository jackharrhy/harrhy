# Sluggers design cookoff

Private, read-only workbench at `/sluggers-lab?concept=broadcast-prism&screen=matchday`. The current catalogue is deliberately curated to **six**, not an accumulating history of experiments. It is not six production theme APIs or a replacement for the historical runtime.

## Current set

<!-- prettier-ignore -->
| Concept | Role | Composition |
| --- | --- | --- |
| Broadcast Prism | Recommended; Broadcast + Frost | Broad fixture board and standings rail, faceted glass, 18px diffusion |
| Broadcast Float | Broadcast + Frost | Full-width floating shelves, two aligned fixture columns, 24px diffusion |
| Frost Studio | Broadcast + Frost | Compact result rail, wider standings, dense player records, 12px diffusion |
| Frost Ribbon | Broadcast + Frost | Centered 1080px stacked scorebook, rounded compact records, 28px diffusion |
| Pennant Broadcast | Reference anchor | Opaque gradient board and original Rodin header typography |
| Dugout Frost | Reference anchor | Original steel-tinted compact panes and 6px frosting |

Ten weaker concepts were removed, including their recipe files: Pennant Park, Clubhouse Channel, Daylight Stadium, Captain’s Club, Dugout Link, Superstar Circuit, Pennant Veranda, Pennant Canopy, Dugout Ledger and Dugout Pocket. Their source history remains in Git, not hidden in the runtime catalogue. Unknown/retired query IDs fall back to the recommendation. No historical application, private asset or source capture was deleted.

## Entry points and locality

- `page.tsx`: one canonical Match day, Box score, Lineup & field, and Player catalogue renderer. Concept/screen query parameters are deep-linkable; switching design preserves selected data. Shared native controls/tables and `@harrhy/ui/baseball` retain semantics.
- `concepts/index.ts`: six current entries. Four glass studies draw from Broadcast typography and Frost color; two reference anchors stay available. `foundation.ts` owns their common semantic tokens, field paint and glass edge/header material, not a second theme engine.
- `concepts/types.ts`: complete `ThemeTokens`, seven required local part keys, optional local `panelSurface`/`panelFilter`, field paint and a bounded recipe. CSS scalar strings are not validated CSS. No renderer branches on concept IDs.
- `original.ts`: canonical original cobalt ramp, steel tint and spotted-circle canvas.
- `model.ts`: archive views, finished-score standings, explicit Win/Loss/Draw semantics and conservative unknown-aware totals. No parser, upload, save or network mutation.
- `../lab.server.tsx`: default-off route capability and exact curated asset manifest. Private filesystem code stays server-only.
- `../../../../__tests__/sluggers-lab.test.e2e.ts`: synthetic-only privacy, allowlist, result semantics, keyboard, compact icons, reduced-transparency fallback and responsive checks.

## Original palette and glass material

The live original and its `app/app.css` were inspected before styling. Blue-600 is `oklch(48.197% .17551 261.35)`, sampled as `#1d56bf`; original blue-500/400 are `#2165da`/`#2b70df`. The exact original background remains two 2.5%-white radial circles, 112px tiles and 56px stagger, with a nonrepeating top 70dvh fade and animation off.

The original uses steel tint `oklch(57% .07 262.2)` (`#6178a1`) at 30–40% opacity, with no blur. New glass deliberately adds multi-stop translucent cobalt glazes, a restrained reflection, inset rim and soft offset shadow. The actual Broadcast panel font is `SluggersRodin`; the four new studies retain it rather than substituting generic display lettering.

Diffusion is panel-local and capped to a fading **96px material band**, not a full-page or fixed-viewport filter. Long player catalogues filter only their short heading, avoiding one enormous 120-player blur surface. This bounds measured software-rendering scroll cost while retaining transparent gradient material through the pane. There is no shader/WebGL dependency or animation. Unsupported backdrop filtering and `prefers-reduced-transparency: reduce` give translucent variants opaque blue panes and disable diffusion. The opaque reference is unaffected.

## Component fidelity

Actual original `/matches`, `/match/1`, `/team/1` and `/players/grid` were inspected, along with MatchDayCard, TeamStandings and PlayerIcon source. See `RESEARCH.md` for the comparison.

- Match rows use inward-facing name/logo columns around fixed numeric score slots, with compact metadata/action alignment. Finished outcomes have explicit Win/Loss/Draw labels and green/red/neutral ink, not color alone. Standings restore tinted W/L and signed differential cells. Live/unplayed/missing scores never manufacture a result or zero.
- Player cards use 32px icons, left-aligned names, position/team abbreviations, truthful captain/star marks and a single aligned BAT/FLD/SPD strip. Stat/order rows use 24px portraits. Native inspection targets remain at least 44px; missing portraits stay disclosed letter markers.
- The shared field’s canonical geometry, nine nonoverlapping native targets, selection and detail behavior are unchanged. No Sluggers-specific branch was added to shared primitives.

## Private activation and data truth

Default off: neither `/sluggers-lab` nor its asset route is registered, and no corpus is read. `HARRHY_UI_SLUGGERS_PRIVATE_REVIEW=1` explicitly enables review. `HARRHY_UI_SLUGGERS_REVIEW_DIR` optionally selects the provisioned directory (default `/home/jack/.local/share/sluggers-lab`) containing curated `corpus.json`, `manifest.json` and `assets/`. Never point this at a backup, database volume or home directory. Image names must match both a narrow pattern and exact manifest key; adjacent files/arbitrary paths are not served. Private responses are `no-store`.

`HARRHY_UI_SLUGGERS_PRIVATE_FONTS=1` separately enables provisioned private font declarations. No licensed binaries or original data/artwork are committed or added to public images/dependencies. Owner permission for private review is not redistribution clearance.

The existing sanitized export contains 10 teams, 120 players, 13 match days, 65 matches, 900 frozen appearances and 360 stat rows. It was obtained with explicit projections in one read-only transaction; no account/session/credential fields, raw backups or original runtime were changed. Per-inning runs were not recorded, so innings remain `—` while authoritative totals stay real. Current lineups and frozen match appearances remain distinct. Missing original portraits are not replaced with unrelated images.

Check from repository root:

```sh
npm run check --workspace @harrhy/ui-app
npm run knip:check
```

Actual-data browser captures and composited-color bounds supplement synthetic checks; neither is complete assistive-technology/WCAG certification.
