# UI explorer design

Mode: Operate / Read. A component tool, not a landing page.

## Direction

Primer's product documentation is the primary reference: persistent component navigation, compact hierarchy, working examples beside source, explicit variants and accessibility behavior. Geist contributes disciplined neutral surfaces, fine separators, strong action hierarchy, and concise control labels. Neither brand, assets nor React implementation is copied. Use system typography for the tool; respect the specimen's own theme typography.

Explorer and Scenes are different destinations. Explorer selects one component, changes its actual props, exercises its behavior, and shows matching code. Scenes demonstrate compositions, including synthetic Radio views studied from the actual app. Controls and code remain findable without scrolling through unrelated examples. Desktop has a component rail, specimen, and controls; mobile uses disclosed component links and stacked controls. Native links retain useful destinations without scripts.

The workbench chrome stays neutral. Clean, tactile and Artbin themes scope only the specimen, never conditional app selectors. Preserve PR161 Artbin density, typography, borders, feedback contrast and focus. No production app cutover, backend mutation, playback or credentials.

## Primary references

Read directly on 2026-11-15:

- https://primer.style/ and https://primer.style/product/components/button: priority hierarchy, medium default/compact variants, separate navigation and action semantics, retained loading focus, documented states and source alongside live examples.
- https://vercel.com/geist/introduction and https://vercel.com/geist/button: high-contrast neutral hierarchy, component index, code disclosure, action vs link, focusable pending state, specific action labels.
- Official Vercel Labs skill source: https://github.com/vercel-labs/agent-skills at `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`. Its README declares MIT; the repository API has no detected root license and `/LICENSE` returns 404. Do not infer a license grant for copied source from the README alone. No skill installed or source copied. React/Next-specific instructions are not Remix APIs. The useful design guidance is reviewed as reference, not a runtime dependency.

## Official patterns

Select and Tabs compose the pinned official `@remix-run/ui` 0.13.1 behavior; Select uses its Popover, list, option and hidden-input composition. No native select is used in the library/showcase. The Explorer inventories the other published patterns rather than presenting our wrapper coverage as the whole upstream library. Native Dialog remains intentional: this upstream version has no Dialog export. Select renders its default label and hidden form value on the server, but choosing requires hydration. It is not a native required-validation, reset or no-JavaScript replacement. Route navigation stays anchors; search stays native GET.

## Verification

Browser review must include 1440, 768 and 390px, keyboard navigation and focus return, native GET navigation, matching code/controls, scope isolation and meaningful state transitions. Automated tests do not establish assistive-technology conformance. Code UI research, API and license decisions live in the package's CODE.md. The integrated native code views do not add a highlighter or client runtime. The app-local Radio port records exact source and font provenance in `app/public/radio/README.md`; original room geometry, texture, icons and interaction patterns are retained, while file/audio/socket/storage effects are replaced with synthetic local actions. Browser tests forbid those runtime effects and non-asset network requests.
