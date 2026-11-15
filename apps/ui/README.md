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

Tests use temporary loopback servers. Install browser support with `npx playwright install chromium`. The check runs typechecking, router tests, browser component contracts and end-to-end tests. Remix test discovery is anchored at the root to share the hoisted browser harness; the glob remains restricted to this app.

## Entry points

- `server.ts`: Node Fetch adapter, binding and shutdown; dev child IPC reports its ephemeral loopback port.
- `dev.mjs`: development-only watched candidate compilation, handoff, no-store proxy and last-working failure behavior.
- `app/routes.ts`, `app/router.tsx`, `app/hosts.ts`: route, shared host policy, health and document rendering.
- `app/assets.ts`: browser source mounts and package allowlist; excludes tests and server source.
- `app/public/entry.ts`: browser runtime boot.
- `app/public/explorer.tsx`: component navigation, live controls, preview and matching code.
- `app/public/scenes.tsx`: scene navigation, composed form fixtures and theme comparison.
- `app/public/radio/`: source-derived Radio room presentation, synthetic action model and scenario fixtures; its README records source and font provenance.
- `app/public/workbench.tsx`: shared, globally themed header and theme URL updates.
- `app/public/themes.ts`: showcase theme catalogue.
- `__tests__/`: host/source rejection, native GET, interactions, focus, pending guards, scope isolation and responsive overflow.
- `PRODUCT.md`, `DESIGN.md`: scope and pinned references.
- `VERIFICATION.md`: independent audit resolution, measured contrast, keyboard/scroll evidence and remaining accessibility gaps.

## Behavior and boundaries

Explorer is the default route. `?component=field&theme=brutalist` opens a specimen directly; `q` filters navigation using native GET. The global header theme picker updates the URL and themes the entire workbench. Header navigation, component links, search and scene links retain that theme. Button has one story with an explicit Async action toggle for pending, failure and retry; its matching source uses the same public Button. Controls drive actual library props; source changes alongside them. Code remains selectable; clipboard failure is reported. Component behavior requires hydration, but component links (including the mobile disclosure) and search remain useful without scripts. All Select controls compose official `@remix-run/ui/select` and Popover behavior through the themed interactive export; there are no native select elements. The server renders the default label and hidden form value, not a no-JavaScript choice widget. Select does not implement native required validation or form-reset synchronization. The upstream inventory distinguishes adopted Select/Tabs/Popover from available patterns we do not wrap; native Dialog remains because this pinned upstream version has no Dialog pattern.

`?view=scenes` opens composed fixtures; `&scene=themes` compares the supplied themes. `&scene=radio` opens the actual Radio player/queue/listener layout adapted to synthetic data: transport, seek, volume, calibration, rename, delete, queue-next and keyboard/drag reorder. Scenario controls expose empty/offline/syncing/upload/failed/buffering states. Playing only changes local fixture state; no audio, file selection, WebSocket, browser storage or backend client is initialized. The local Radio Material Symbols font preserves its Apache-2.0 license; Pretext uses Radio's existing fitter, not a second implementation. Consent and board creation use local memory only. Native required validation remains enabled on native inputs; it is not promised for the custom Select. Reload clears state. Artbin follows its actual kitchen sink, not generic neobrutalism. The workbench dogfoods shared ButtonLink, Button, Input, Checkbox and Select controls and the same semantic theme tokens as its previews. Radio retains a deliberately nested app-owned desktop skin.

Imports use explicit `@harrhy/ui/native`, `/interactive`, `/theme` and `/code` subpaths. Every Explorer source panel uses the shared CodeBlock; dedicated code/diff stories exercise safe live source, long lines and prepared row states. The app-owned `highlight.tsx` adapter prepares safe tokens with Shiki 4.6.0 (the existing Harrhy highlighting family), one TSX grammar, Github-light-derived contrast-adjusted colors and the JavaScript regex engine. SSR and browser updates use the same synchronous adapter; its 64-entry cache is bounded. Text, sources over 20,000 characters or lines over 2,000 characters remain complete plain text. Existing Shiki consumers remain unchanged. The package root remains legacy styles for existing Worker consumers. Artbin uses self-hosted Fraunces display headings/callouts, IBM Plex Sans body/controls, and IBM Plex Mono code/small labels; `../../packages/ui/fonts/README.md` records the exact sources, verified axes, selected-theme/on-use loading and per-family OFL licenses; `THIRD_PARTY_NOTICES.md` indexes the preserved notices. No production Artbin cutover, Storybook dependency, remote font requests, secrets, storage or production configuration. No account, backend or playback requests. Docker builds from the root lockfile; deployment and routing are outside the app.

Browser contracts cover caller veto, pending-action focus/repeat guards, abort and stale-result suppression, dynamic Field ARIA, controlled dialog Escape/focus return, native `method="dialog"` return values, official tab keyboard behavior and 390/768/1440px overflow. They do not establish assistive-technology conformance. Action owners must honor abort signals before side effects; dialog owners must reconcile `open=false` after native close notifications.
