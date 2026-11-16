# Baseball display parts

`@harrhy/ui/baseball` exports two data-driven Remix 3 display components. They contain no league data, artwork, fetching, persistence, app routing, or game-specific primitive branches.

- `BaseballField({label, players, selectedId?, onSelect?})`: nine named defensive locations on a scalable geometric field. Each player supplies an arbitrary ID, display name, position, optional image and detail. Supplying `onSelect` renders native labelled buttons with focus rings and pressed state; otherwise positions are static text. The host owns selection and any editor behavior. Hit targets stay 44×44px; in containers at most 480px wide, diagram buttons become noninteractive markers and selection moves to a two-column native position key below the diagram, avoiding overlapping targets. Optional detail is included in each button's accessible name. This is a field diagram, not a drag-and-drop lineup editor.
- `BaseballScoreboard({label, innings, teams})`: a named keyboard-scrollable region with a native table. Each team supplies an ID, name, optional image, per-inning values and authoritative run total; optional hit/error totals remain unknown when absent. Null is printed as `—`, never silently converted to zero. The component does not derive a total from incomplete innings. Each team's inning array must exactly match the header count; mismatches throw a descriptive RangeError instead of shifting R/H/E into the wrong columns.

Theme via the normal `--hui-*` semantic tokens. Field geometry additionally accepts `--baseball-grass`, `--baseball-infield`, `--baseball-line`, `--baseball-marker` and `--baseball-portrait-size`. Images belong to callers, use empty alternative text beside the player's visible name, and must have appropriate usage rights. No image or font assets ship with this module.

The private Sluggers cookoff is the first host. Browser integration tests in `apps/ui/__tests__/sluggers-lab.test.e2e.ts` exercise field keyboard selection and full layouts across six recipes and four widths (320, 390, 768 and 1440px) using only synthetic test data. Run `npm run check --workspace @harrhy/ui` and `npm run check --workspace @harrhy/ui-app`. These checks are not assistive-technology certification.

## Geometry and paint

`baseballFieldStyles(paint: BaseballFieldPaint)` maps five required string paint values to CSS variables: typed keys, not validated CSS values. The original SVG and overlays share exported `baseballDiamond` coordinates: a 90-foot square rotated 45 degrees and rubber 60.5 feet from home. Defender locations and the 300-foot outfield arc are schematic, not regulation field boundaries. See [MLB dimensions](https://www.mlb.com/glossary/rules/field-dimensions) and the [public-domain vector reference](https://commons.wikimedia.org/wiki/File:Baseball_field_overview.svg) by Robert Merkel and later contributors. No external SVG was vendored.

Base, rubber and mound glyphs are enlarged diagram symbols, not regulation-sized footprints.
