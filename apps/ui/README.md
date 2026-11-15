# @harrhy/ui-app

Internal explorer and composition workbench for [@harrhy/ui](../../packages/ui/README.md). Not a production app migration.

## Run and check

From the root after `npm ci`:

```sh
npm run dev --workspace @harrhy/ui-app
npm run check --workspace @harrhy/ui-app
```

Default binding: `127.0.0.1:18943`. Configure `HOST` and `PORT`; Docker binds `0.0.0.0`. `UI_HOSTS` replaces the default hostname allowlist: `localhost,127.0.0.1,[::1],harrhy-ui.pi.jackharrhy.dev`. Unknown hosts receive 404 before pages, health or assets. Forwarded host headers do not override the hostname. This is not authentication or deployment authorization.

Tests use temporary loopback servers. Install browser support with `npx playwright install chromium`. The check runs typechecking, router tests, browser component contracts and end-to-end tests. Remix test discovery is anchored at the root to share the hoisted browser harness; the glob remains restricted to this app.

## Entry points

- `server.ts`: Node Fetch adapter, binding and shutdown.
- `app/routes.ts`, `app/router.tsx`: route, host policy, health and document rendering.
- `app/assets.ts`: browser source mounts and package allowlist; excludes tests and server source.
- `app/public/entry.ts`: browser runtime boot.
- `app/public/explorer.tsx`: component navigation, live controls, preview and matching code.
- `app/public/scenes.tsx`: scene navigation, composed form fixtures and theme comparison.
- `app/public/radio/`: source-derived Radio room presentation, synthetic action model and scenario fixtures; its README records source and font provenance.
- `app/public/themes.ts`: showcase theme catalogue.
- `__tests__/`: host/source rejection, native GET, interactions, focus, pending guards, scope isolation and responsive overflow.
- `PRODUCT.md`, `DESIGN.md`: scope, pinned references and verification boundaries.

## Behavior and boundaries

Explorer is the default route. `?component=field&theme=brutalist` opens a specimen directly; `q` filters navigation using native GET. Theme changes update the URL and scope only the specimen. Controls drive actual library props; source changes alongside them. Code remains selectable; clipboard failure is reported. Component behavior requires hydration, but component links (including the mobile disclosure) and search remain useful without scripts. All Select controls compose official `@remix-run/ui/select` and Popover behavior through the themed interactive export; there are no native select elements. The server renders the default label and hidden form value, not a no-JavaScript choice widget. Select does not implement native required validation or form-reset synchronization. The upstream inventory distinguishes adopted Select/Tabs/Popover from available patterns we do not wrap; native Dialog remains because this pinned upstream version has no Dialog pattern.

`?view=scenes` opens composed fixtures; `&scene=themes` compares the supplied themes. `&scene=radio` opens the actual Radio player/queue/listener layout adapted to synthetic data: transport, seek, volume, calibration, rename, delete, queue-next and keyboard/drag reorder. Scenario controls expose empty/offline/syncing/upload/failed/buffering states. Playing only changes local fixture state; no audio, file selection, WebSocket, browser storage or backend client is initialized. The local Radio Material Symbols font preserves its Apache-2.0 license; Pretext uses Radio's existing fitter, not a second implementation. Consent and board creation use local memory only. Native required validation remains enabled on native inputs; it is not promised for the custom Select. Reload clears state. Artbin follows its actual kitchen sink, not generic neobrutalism. The workbench chrome does not restyle package controls or theme recipes.

Imports use explicit `@harrhy/ui/native`, `/interactive`, `/theme` and `/code` subpaths. Every Explorer source panel uses the shared CodeBlock; dedicated code/diff stories exercise safe live source, long lines and prepared row states. Language labels do not promise highlighting. Existing Shiki consumers remain unchanged. The package root remains legacy styles for existing Worker consumers. No Storybook dependency, remote fonts, secrets, storage or production configuration. No account, backend or playback requests. Docker builds from the root lockfile; deployment and routing are outside the app.

Browser contracts cover caller veto, pending-action focus/repeat guards, abort and stale-result suppression, dynamic Field ARIA, controlled dialog Escape/focus return, native `method="dialog"` return values, official tab keyboard behavior and 390/768/1440px overflow. They do not establish assistive-technology conformance. Action owners must honor abort signals before side effects; dialog owners must reconcile `open=false` after native close notifications.
