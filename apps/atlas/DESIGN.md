# Atlas reading surface

Read mode. Owner direction updated November 15, 2026: adopt merged `@harrhy/ui` themes and native controls, add agent navigation across the top and a theme picker at the top right. Preserve corpus identity, content/search routes, native disclosures and readable articles. No branding masthead, dashboard cards or client application shell.

## Themes and type

`app/theme.ts` imports Clean, tactile/Radio and brutalist/Artbin directly from `@harrhy/ui/theme`, composing only 18px text and 1.7 line-height for reading. `themeRoot` supplies the corresponding UI/display/mono families and semantic canvas, ink, border, accent and focus roles. The theme is selected server-side from a validated query value or HttpOnly SameSite=Lax preference cookie. Artbin is the default for new visitors; valid query and saved choices still win. Initial HTML has its final theme: no client script or color flash.

Artbin uses the Explorer’s OFL Fraunces, IBM Plex Sans and IBM Plex Mono resources, copied into this app’s own public boundary with licenses and provenance. The stylesheet loads only on Artbin pages; fonts load on use. Clean and Radio use the shared themes’ system stacks. No external font service, icon font or Explorer-only visual stylesheet.

## Layout and controls

The thin header matches main’s centered 72ch reading measure and gutters. Only tables break out wider. Agent links and a top-right gear share a row; links wrap on narrow screens. The gear uses the existing shared Button `quiet` variant: no visible idle border, background or shadow, while keeping the shared keyboard focus ring and comfortable touch target. Its settings popover aligns to the content column’s right edge rather than the viewport. The gear opens a native auto popover containing the theme form, with browser-managed Escape, outside-click dismissal and keyboard focus. No client script is needed. These are route links with aria-current, never an ARIA tabs widget. Labels come from Atlas’s existing trusted spaces registry; page-count tooltips derive from the current catalog generation, including legitimate empty registered spaces.

Main is a centered 72ch prose column with 1.25rem gutters and normal document hierarchy. GFM tables break out up to 76rem within the viewport gutters; each table has a labelled, keyboard-focusable horizontal scroll region. Semantic table headers retain alignment and column scope. Code remains bounded to prose width. On narrow screens the navigation wraps rather than disappearing into a drawer. Keep the skip link, focus rings, visible article link underlines and native details/summary behavior.

The theme selector is a native select styled with shared control/focus recipes and a real shared Button submit control. Search uses shared Field/Input/Button. Notice renders rejected-generation status. No JavaScript bundle is needed for ordinary reading. Explicit trusted widget markers can mount a small client-only Remix root with shared native/interactive components; keep the rest of the document server-rendered. Theme submission preserves query parameters, including scoped search words; the cookie preserves the choice across routes.

## Verification

Use synthetic content for committed tests and any shareable captures. Check every theme at desktop and 390px, article/code/table readability, keyboard focus, native theme persistence, agent navigation and scoped search. Ordinary Markdown remains sanitized and cannot inject scripts/styles/images. An externally registered trusted TSX module is a separate deliberate code boundary, compiled to a versioned private browser asset, never executed by the Node renderer. Visual and browser checks supplement server tests; they are not a claim of complete assistive-technology conformance.

## Trusted interactive previews

Operate mode inside a Read article. Preserve the article themes and reading measure; widgets use the merged shared native controls and `css(...)` mixins rather than a new shell or theme engine. The annotation prototype is externally authored content, not a hardcoded app feature. It shows a quiet top-right comment-mode toggle, a selection composer, and a compact bottom-right staged-review tray. Label local staging and disabled mock delivery honestly. Use actual validated SVG glyph geometry from the instance's chosen icon source; do not invent agent logos or put a deployment roster in generic app code. Test all three themes at desktop and 390px, no-JavaScript fallback, scoped CSP, no-restart reload, compile failure last-good behavior and client runtime failure notices.
