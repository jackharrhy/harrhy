# @harrhy/ui-app

Internal explorer and composition workbench for [@harrhy/ui](../../packages/ui/README.md). Not a production app migration.

## Run and check

From the root after `npm ci`:

```sh
npm run dev --workspace @harrhy/ui-app
npm run check --workspace @harrhy/ui-app
```

Default binding: `127.0.0.1:18943`. Configure `HOST` and `PORT`; Docker binds `0.0.0.0`. `UI_HOSTS` replaces the default hostname allowlist: `localhost,127.0.0.1,[::1],harrhy-ui.pi.jackharrhy.dev`. Unknown hosts receive 404 before pages, health or assets. Forwarded host headers do not override the hostname. This is not authentication or deployment authorization.

`npm run dev` runs `dev.mjs`: a stable listener watches app/shared UI source, starts fresh Node candidates, preflights Explorer and Scenes compilation, and hands off only a working revision. Compile failures keep the last working process and show a visible warning; service logs contain the error. Reload the page to see accepted source changes (no HMR claim). Directory watches survive rename-based editor saves. Candidates and the stable listener both enforce the same host allowlist; readiness probes preserve an allowed Host even with a preview-only allowlist. Dev HTML/assets use `Cache-Control: no-store`, ignore conditional validators, and expose `X-UI-Preview-Revision`/`X-UI-Preview-State` plus a revision meta tag. Changing supervisor code/environment still requires restarting that supervisor; ordinary app/component edits do not. Production `npm start`/Docker do not use this supervisor or override asset caching. For a leased preview, keep the stable listener running; remove its lease before stopping/reusing its port.

`npm run check` runs typechecking and Remix server tests without a browser. To check browser-only behavior locally, install Chromium with `npx playwright install chromium` and run `npm run test:browser`. With pnpm’s global virtual store, the optional browser runner stages the modules needed by Remix’s test harness inside the checkout.

## Entry points

- `server.ts`: Node Fetch adapter, binding and shutdown; dev child IPC reports its ephemeral loopback port.
- `dev.mjs`: development-only watched candidate compilation, handoff, no-store proxy and last-working failure behavior.
- `app/routes.ts`, `app/router.tsx`, `app/hosts.ts`: route, shared host policy, health and document rendering.
- `app/assets.ts`: browser source mounts and package allowlist; excludes tests and server source.
- `app/public/entry.ts`: browser runtime boot.
- `app/public/expanded-stories.tsx`: Progress, Breadcrumbs, Table, native Collapsible, official Accordion/Menu and typography specimens with matching source.
- `app/public/explorer.tsx`: component navigation, live controls, preview and matching code.
- `app/public/scenes.tsx`: scene navigation, composed form fixtures and theme comparison.
- `app/public/workspace.tsx`: shared scene and component navigation, with independently scrolling navigation and preview panes.
- `app/public/radio/`: source-derived Radio room presentation, synthetic action model and scenario fixtures; its README records source and font provenance.
- `app/public/sluggers/`: four synthetic league/result/lineup/import compositions using the shared Sluggers theme, plus an explicitly opt-in private cookoff; its README records fixture and private-font boundaries.
- `app/public/workbench.tsx`: shared, globally themed header and theme URL updates.
- `app/public/themes.ts`: showcase theme catalogue.
- `__tests__/`: host/source rejection, native GET, interactions, focus, pending guards, scope isolation and responsive overflow.
- `PRODUCT.md`, `DESIGN.md`: scope and pinned references.
- `VERIFICATION.md`: independent audit resolution, measured contrast, keyboard/scroll evidence and remaining accessibility gaps.

## Private Sluggers font opt-in

Sluggers works without private files using declared system fallbacks. `HARRHY_UI_SLUGGERS_PRIVATE_FONTS=1` (or the explicit `createApp` test/host option) enables `/assets/ui/sluggers/fonts.css` declarations only on an authorized private host with those local assets provisioned. Font redistribution rights remain unresolved; do not commit binaries or enable this on a public deployment. The stylesheet contains only font-face declarations and is available before theme selection, so hydrated Clean → Sluggers works without reloading. Browsers fetch font binaries only when a visible Sluggers subtree uses the family; ordinary Clean/Radio pages do not download them. Default-off builds request neither private CSS nor fonts. A theme-comparison page includes a visible Sluggers subtree and may legitimately load its families when opted in.

The shared commit does not include the separate Sluggers scene or its private assets. The scene owner integrates that app-owned directory and consumes the shared theme; the theme is not a scene-only palette. `__tests__/sluggers-theme.test.e2e.ts` checks representative Explorer layouts at 390/1440px and tests actual hydrated font activation using an already licensed synthetic font, never the private binaries. The router suite checks the Sluggers preview and source for every Explorer entry.

## Behavior and boundaries

Explorer is the default route. `/explorer/field?theme=newspaper` opens a specimen directly; `q` filters navigation using native GET. The global header theme picker updates the URL and themes the entire workbench. Basic (Clean), Dial (Radio), Newspaper (Artbin), Scorebook (Sluggers) and Graphite are first-class options; `?theme=scorebook` applies the actual shared `sluggersTheme` token data to every Explorer component, matching source and the theme-comparison scene. Header navigation, component links, search and scene links retain that theme. Button has one story with an explicit Async action toggle for pending, failure and retry; its matching source uses the same public Button. Controls drive actual library props; source changes alongside them. Code remains selectable; clipboard failure is reported. Component behavior requires hydration, but component links (including the mobile disclosure) and search remain useful without scripts. All Select controls compose official `@remix-run/ui/select` and Popover behavior through the themed interactive export; there are no native select elements. The server renders the default label and hidden form value, not a no-JavaScript choice widget. Select does not implement native required validation or form-reset synchronization. The upstream inventory distinguishes adopted Accordion/Menu/Select/Tabs/Popover from available patterns we do not wrap; native Dialog remains because this pinned upstream version has no Dialog pattern.

`/scenes` opens composed fixtures; `/scenes/themes` compares the supplied themes. `/scenes/radio` opens the actual Radio player/queue/listener layout adapted to synthetic data: transport, seek, volume, calibration, rename, delete, queue-next and keyboard/drag reorder. Scenario controls expose empty/offline/syncing/upload/failed/buffering states. Playing only changes local fixture state; no audio, file selection, WebSocket, browser storage or backend client is initialized. The local Radio Material Symbols font preserves its Apache-2.0 license; Pretext uses Radio's existing fitter, not a second implementation. Consent and board creation use local memory only. Native required validation remains enabled on native inputs; it is not promised for the custom Select. Reload clears state. Artbin follows its actual kitchen sink, not generic neobrutalism. The workbench dogfoods shared ButtonLink, Button, Input, Checkbox and Select controls and the same semantic theme tokens as its previews. The Radio scene keeps its desktop layout and uses the original room palette when Radio is selected. Other presets recolor the room itself and its controls.

Imports use explicit `@harrhy/ui/native`, `/interactive`, `/theme` and `/code` subpaths. Every Explorer source panel uses the shared CodeBlock; dedicated code/diff stories exercise safe live source, long lines and prepared row states. The app-owned `highlight.tsx` adapter prepares safe tokens with standalone Pierre Highlights 0.5.1 through `@harrhy/ui/highlight`, retaining GitHub-light contrast adjustments and a bounded 64-source cache. SSR and browser updates share the synchronous adapter; text, sources over 20,000 characters or lines over 2,000 characters remain complete plain text. Prepared diff rows use the same adapter, without a Diffs runtime. The asset server explicitly allows Highlights; its browser default embeds WASM, so hosts adopting a strict CSP must explicitly support WASM compilation. No other app CSP is relaxed. The [code runtime guide](../../docs/ui/code.md) records the measured browser transfer regression versus the former single-TSX Shiki graph. The package root remains legacy styles for existing Worker consumers. Artbin uses self-hosted Fraunces display headings/callouts, IBM Plex Sans body/controls, and IBM Plex Mono code/small labels; `../../packages/ui/fonts/README.md` records the exact sources, verified axes, selected-theme/on-use loading and per-family OFL licenses; `THIRD_PARTY_NOTICES.md` indexes the preserved notices. No production Artbin cutover, Storybook dependency, remote font requests, secrets, storage or production configuration. No account, backend or playback requests. Docker builds from the root lockfile; deployment and routing are outside the app.

Browser contracts cover caller veto, pending-action focus/repeat guards, abort and stale-result suppression, dynamic Field ARIA, controlled dialog Escape/focus return, native `method="dialog"` return values, official tab keyboard behavior and 390/768/1440px overflow. They do not establish assistive-technology conformance. Action owners must honor abort signals before side effects; dialog owners must reconcile `open=false` after native close notifications.

The Explorer includes seven extracted story groups in addition to the original controls: native progress with known/unknown/complete controls; compositional breadcrumbs (also used by the Radio scene); native table parts; no-script Collapsible; official single/multiple Accordion with disabled items; official Menu with local selection and focus return; and Heading/Text composition. No shared EmptyState or Item wrapper is introduced. These are live stories, not an upstream widget coverage claim. `__tests__/expanded.test.e2e.ts` checks keyboard behavior, closed-panel visibility, source changes, semantics and 390/768/1440px overflow.

Navigation consolidates route links and in-page Tabs into one Explorer entry with both code examples (20 total entries). Their visual recipes are shared; their native-link and official-tab semantics remain separate. The old `/?component=navigation-menu` URL opens this combined entry. Menu includes a side-by-side Select for popup-gap comparison. Both use the same 6px theme token through official positioning, including desktop and flipped placement. Table borders have one outer owner; Radio tables draw their compact header/grid treatment from the source Radio room rather than inheriting Clean presentation. `__tests__/polish.test.e2e.ts` checks shared navigation presentation, table border ownership, Radio header treatment, popup gaps, viewport flipping and keyboard focus.

`/scenes/sluggers?theme=basic` opens Sluggers inside the existing workbench. Its four local views and two tenant fixtures use memory only; no account, parser, upload, backend or persistence is initialized. The scene follows the selected workbench theme. The original dotted backdrop is shown with the Sluggers preset. Original font rights remain unresolved: binaries are not committed. Only an explicitly provisioned private preview may set `HARRHY_UI_SLUGGERS_PRIVATE_FONTS=1` to load `/assets/ui/sluggers/fonts.css` on this scene; default/CI rendering uses fallback fonts without requesting absent assets. This flag does not grant redistribution rights. Keep private font provisioning outside the public image/checkout.

[Sluggers research](../../docs/ui/sluggers-research.md)

## Clank comparison

Open Scenes → Clank cook-off (`/scenes/clank`). Basic, Newspaper and Graphite share one in-memory transcript. Replay or Step, then switch between the literal-tail and Pierre Words renderers without resetting progress. [Design and renderer findings](../../docs/ui/clank-cookoff.md). No real agent, storage, tool execution or connection to Clank.
