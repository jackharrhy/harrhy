# Visual and geometry references

The owner’s private original [kitchen sink](https://sluggers-old.pi.jackharrhy.dev/kitchen-sink) is the primary visual evidence: blue backdrops, glossy portrait rails, yellow active states, spatial field positions, inning tables and round selection dialogs. Three curated screenshots remain private, outside Git. Nintendo artwork and private fonts have unresolved redistribution rights. Private review permission is not a public asset license.

[Nintendo’s official Japanese site](https://www.nintendo.co.jp/wii/rmbj/) provides historical context; its legacy Flash presentation is not a component library.

## Field geometry

[MLB field dimensions](https://www.mlb.com/glossary/rules/field-dimensions) specifies a 90-foot base square and a pitching rubber 60 feet 6 inches from home. The authored shared SVG uses those coordinates for bases and rubber, with the same projection for player overlays. Fielders’ locations and the 300-foot outfield arc are schematic; actual fences vary.

[Baseball field overview.svg](https://commons.wikimedia.org/wiki/File:Baseball_field_overview.svg) is a public-domain vector reference by Robert Merkel, with later revisions credited to Gareth Owen and Rememberthedot. The Commons license declaration was inspected. The downloaded SVG was studied, not copied or redistributed: the component contains original authored paths and canonical geometry rather than an unreviewed external SVG file.

## Libraries considered

[WiiMenu](https://github.com/M4rc3lv/WiiMenu) uses GPL-3.0 and is launcher-oriented, not a drop-in Remix component library. [NES.css](https://github.com/nostalgic-css/NES.css) uses MIT but targets a different, 8-bit visual era. Neither was installed and no browser code was copied. The six experiments use existing shared Remix UI primitives and narrowly typed local recipes.

## Component comparison before the current refinement

The running original `/matches`, `/match/1`, `/team/1` and `/players/grid` were captured and compared with MatchDayCard, TeamStandings, PlayerIcon and TeamPlayerList source before changing components.

- Original match rows center a fixed 72px score slot between inward-facing identity/icon groups. The lab previously used tall logo/name stacks and uncolored score strings. Current rows restore compact metadata, aligned name/logo groups, fixed score slots and Rodin numeric emphasis. The web slots are wider than the original so actual private-font two-digit glyphs do not collide at 320px; original mobile overflow is not copied.
- Original standings color W/L/differential and weekly result surfaces. The lab now restores tinted W/L and signed differential cells, plus explicit Win/Loss/Draw text in match rows. Results require finished authoritative totals; unknown, live and unplayed matches cannot acquire an invented result.
- Original PlayerIcon defaults to 32px (24px small); the original catalogue uses approximately 144×92 tiles with team abbreviations and truthful captain/star marks. The lab replaces 64px portrait stacks with 32px icon/identity records, an aligned single stat strip and actual team/role marks. Table and batting-order portraits are 24px; interactive targets remain at least 44px. Missing original images still use disclosed letters, not the original broken-image/fallback behavior.
- Broadcast’s actual panel font is SluggersRodin. The four new glass studies use that existing private opt-in face with Frost’s source steel/cobalt palette; no new font binaries or OS-chrome imitation are introduced.

Glass gradients are layered in paint order, with a subdued reflection, cobalt lower glaze and an inset rim. Diffusion is capped to a fading 96px band per pane; long catalogues blur only their heading. This replaces the expensive whole-tall-panel filter found during software-rendering scroll checks. The background canvas stays the original unanimated 112px/56px circle pattern. There is no WebGL, fixed viewport blur or external rendering dependency.
