# Atlas reading surface

Read mode. Owner direction updated November 15, 2026: adopt merged `@harrhy/ui` themes and native controls, add agent navigation across the top and a theme picker at the top right. Preserve corpus identity, content/search routes, native disclosures and readable articles. No branding masthead, dashboard cards or client application shell.

## Themes and type

`app/theme.ts` imports Clean, tactile/Radio and brutalist/Artbin directly from `@harrhy/ui/theme`, composing only 18px text and 1.7 line-height for reading. `themeRoot` supplies the corresponding UI/display/mono families and semantic canvas, ink, border, accent and focus roles. The theme is selected server-side from a validated query value or HttpOnly SameSite=Lax preference cookie. Initial HTML has its final theme: no client script or color flash.

Artbin uses the Explorer’s OFL Fraunces, IBM Plex Sans and IBM Plex Mono resources, copied into this app’s own public boundary with licenses and provenance. The stylesheet loads only on Artbin pages; fonts load on use. Clean and Radio use the shared themes’ system stacks. No external font service, icon font or Explorer-only visual stylesheet.

## Layout and controls

The header is bounded at 76rem. Theme form aligns right and wraps; agent links wrap below it, with a 44px minimum target and visible active underline/weight. These are route links with aria-current, never an ARIA tabs widget. Labels come from Atlas’s existing trusted spaces registry; page-count tooltips derive from the current catalog generation, including legitimate empty registered spaces.

Main is a centered 72ch column with 1.25rem gutters, bounded code/table horizontal overflow and normal document hierarchy. On narrow screens the navigation wraps rather than disappearing into a drawer. Keep the skip link, focus rings, visible article link underlines and native details/summary behavior.

The theme selector is a native select styled with shared control/focus recipes and a real shared Button submit control. Search uses shared Field/Input/Button. Notice renders rejected-generation status. No interactive package, hydration or JavaScript bundle is needed. Theme submission preserves query parameters, including scoped search words; the cookie preserves the choice across routes.

## Verification

Use synthetic content for committed tests and any shareable captures. Check every theme at desktop and 390px, article/code/table readability, keyboard focus, native theme persistence, agent navigation and scoped search. Source content remains separate from application assets and cannot inject scripts/styles/images. Visual and browser checks supplement server tests; they are not a claim of complete assistive-technology conformance.
