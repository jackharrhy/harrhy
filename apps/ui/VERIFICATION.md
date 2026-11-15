# @harrhy/ui Explorer verification

Polish review, 2026-11-15. Scope: library and synthetic workbench only; production apps unchanged.

## Independent review

Read-only `openai-codex/gpt-6-astra`, medium thinking, compared the owner's screenshots, live browser, actual Remix pattern and Primer/Geist references. Main was the sole source writer. Follow-up found no substantive blockers after checking state differentiation, nested geometry, global themes/navigation, linked branding, removed inventory, Radio transport/volume and mobile overflow. The stale intermediate Radio screenshot with clipped transport labels was replaced after fixing the shared-button/icon composition.

## Browser and contrast evidence

Real Chromium at 1440, 768 and 390px, all three themes: Select hover, selected checkmark, inset keyboard focus, disabled option and disabled trigger. No page overflow or script errors in those captures. Header and forms inherit the selected theme; URL changes, reload, Explorer/Scenes navigation, search and scene links preserve it. Brand links to `/` on the same origin. Theme comparison intentionally retains independently scoped specimens; Radio intentionally retains its nested desktop skin.

Measured sRGB contrast ratios, not a claim of full WCAG conformance:

<!-- prettier-ignore -->
| Pair | Clean | Radio | Artbin |
| --- | --- | --- | --- |
| Body / canvas | 15.21 | 10.96 | 16.57 |
| Muted / popup surface | 6.40 | 6.48 | 5.74 |
| Disabled ink / disabled surface | 5.59 | 5.54 | 5.04 |
| Selected ink / selected surface | 8.99 | 9.22 | 13.90 |
| Highlight ink / highlight surface | 14.26 | 10.42 | 16.28 |
| Essential control border / surface | 3.50 | 4.55 | 3.54 |
| Essential control border / canvas | 3.27 | 4.11 | 3.11 |
| Focus / selected surface | 4.69 | 5.18 | 11.71 |
| Focus / highlight surface | 5.06 | 5.75 | 13.71 |

Artbin retains square geometry, Times typography, compact density and pale panel separators. Essential input boundaries are deliberately darker than the original #ccc (1.61:1 on white); #888 now clears 3:1. Selection is not color-only: a persistent checkmark distinguishes it from the moving highlight. Popup padding, inner/outer radius and row gap are separate tokens rather than a global radius adjustment.

Axe-core 4.11.0 was run externally (not added to app dependencies) against Select-open, Forms and Radio at all nine theme/width combinations: 27 snapshots, zero reported WCAG A/AA violations after fixes. It initially found low-contrast Radio index text and an inaccessible narrow-screen listeners scroll region; text was darkened and the named list made keyboard-focusable with the shared focus recipe. Incomplete checks remain: closed upstream popup `aria-controls` relationships and gradient/image contrast in Radio require manual review; zero reported violations is not conformance certification.

## Interaction checks

- Official Select: Home/End/arrows skip disabled options, typeahead commits the actual hidden form value, disabled hidden values are omitted, Escape dismisses and returns focus. Field label/help/error relationships remain intact.
- Open-list Tab interception is upstream policy and remains a known limitation. Dismiss with Escape, then Tab advances normally; native select traversal/reset/required/no-JavaScript equivalence is not claimed.
- Radio scenario list scrolls to its last highlighted option with End: 288px viewport, 424px content, last row visible at all three widths. No page-level horizontal scrolling.
- Native Range: End reaches 1 and updates the live 100% output; native arrows and application seek commit remain intact. Range and calibration targets are at least 24px high. Physical touch gestures and screen-reader behavior remain untested.
- Radio safety tests reject non-asset network requests, playback, sockets and persistent storage. Rename/reorder/delete retain local keyboard focus behavior.

## Reuse boundary

See `app/public/radio/README.md` for component/file ownership. Scenario controls were already shared; actual player adoption now includes five Buttons, two Ranges, rename Input and the listeners focus recipe through a real Radio token scope. Range is a small reusable native primitive with its own Explorer story and SSR contract. Queue/menu/reorder, title fitting, waveform, desktop artwork and synthetic playback model remain app-owned. No percentage or whole-scene shared-library claim is made.

## Checks and remaining gaps

Package and app typechecks/tests, Auth/Ref consumer checks, root tooling, Knip and Docker/nonroot smoke are required before delivery. Automated tests cover native GET/mobile navigation, global theme persistence, source matching, disabled/selected/highlight relationships, modal/tab/action contracts and Radio safety. PR workflows must pass on the final exact head, not an earlier reviewed head.

No actual assistive-technology session, physical touch test, production runtime migration, native Select form-reset integration, or blanket upstream widget coverage is claimed. The pinned upstream Dialog gap and detailed widget inventory remain developer documentation, not showcase status copy.
