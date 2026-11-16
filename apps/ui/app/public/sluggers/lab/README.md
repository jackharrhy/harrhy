# Sluggers design cookoff

Private experimental workbench at `/sluggers-lab?concept=pennant&screen=matchday`. This is an owner-authorized design comparison, not six new production theme APIs or a replacement for the original historical runtime.

## Entry points and locality

- `page.tsx`: one canonical set of Match day, Box score, Lineup & field, and Player catalogue renderers. Native shared controls/tables plus `@harrhy/ui/baseball` supply semantics. Switching concepts preserves selected data and changes actual full-screen styling; `concept` and `screen` are deep-linkable query parameters.
- `concepts/{pennant,channel,stadium,captain,dugout,festival}.ts`: one logical entry per experiment, containing semantic token overrides, visual part recipes and typed LabPartTokens and BaseballFieldPaint mappings. Shared structure does not branch on concept names. `concepts/types.ts` is the small recipe contract.
- `model.ts`: canonical archive view types, standings derived from finished match totals and conservative unknown-aware stat aggregation. There is no app client, parser, upload, save or network mutation.
- `../lab.server.tsx`: opt-in route registration and fixed curated asset manifest. Server-only filesystem access never enters a browser bundle.
- `../../../../../__tests__/sluggers-lab.test.e2e.ts`: synthetic-only route privacy, allowlist, keyboard, complete data and responsive checks. No original data/artwork is committed for tests.

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
