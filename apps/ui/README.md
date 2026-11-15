# @harrhy/ui-app

Internal component workbench for [@harrhy/ui](../../packages/ui/README.md), not a marketing site or a production app migration.

## Run and check

From the repository root after `npm ci`:

```sh
npm run dev --workspace @harrhy/ui-app
npm run check --workspace @harrhy/ui-app
```

The server defaults to `127.0.0.1:18943`. `HOST` and `PORT` configure binding; Docker sets `HOST=0.0.0.0`. `UI_HOSTS` is a comma-separated hostname allowlist (no scheme or port), replacing the defaults: `localhost,127.0.0.1,[::1],harrhy-ui.pi.jackharrhy.dev`. Unknown hosts receive 404 before health, assets, or pages. Forwarded host headers do not override the request hostname. This hostname configuration is not authentication; it does not make a service private or authorize deployment.

Tests use temporary loopback test servers only. Browser tests require Playwright Chromium (`npx playwright install chromium`); no preview server is needed. The check runs typechecking, router tests, browser component contracts, and browser end-to-end tests. The test script anchors Remix discovery at the repository root because the browser harness must share a root with hoisted dependencies; its glob remains restricted to this app.

## Entry points

- `server.ts`: Node Fetch adapter, binding, shutdown.
- `app/routes.ts`, `app/router.tsx`: native Remix route, document rendering, host policy, health.
- `app/assets.ts`: narrow browser source mounts and package allowlist; server and test files are not exposed.
- `app/public/entry.ts`: browser runtime boot.
- `app/public/showcase.tsx`: clientEntry workbench, patterns and theme specimens.
- `__tests__/`: host/source rejection, native GET, browser interactions, focus, tabs, pending guard and responsive overflow checks.
- `PRODUCT.md` / `DESIGN.md`: pinned scope and visual direction, with explicit assumptions.

## Scope

Controls import from `@harrhy/ui/native`, tokens from `@harrhy/ui/theme`, and ActionButton/Dialog/Tabs from `@harrhy/ui/interactive`. The package root remains legacy styles for Worker consumers; the browser graph does not import a root barrel.

Clean Auth/Ref, tactile Radio/PictoChat, and brutalist Artbin expressions come from package theme tokens. The same controls are shown side by side. Working consent and board forms are explicitly local fixtures: no real account, persistence, authorization, or uploads. The GET filter reloads a server-rendered document and works without scripts. The modal uses controlled native dialog behavior; tabs use the package's official Remix UI adapter. The async export is an abortable 1.2-second fixture, not a download. Code snippets are selectable and clipboard-copyable in a secure context; clipboard failures are reported.

Disabled/loading/error states include labelled static specimens. Interactive examples demonstrate real local success, denial, empty and pending states. This app does not change Auth, Ref, Radio, Artbin, PictoChat, or any production configuration.

Contract tests additionally cover caller `preventDefault()` veto, retained pending-action focus, abort on unmount with stale rejection suppression, changing/removing Field descriptions and errors after hydration, and native `method="dialog"` close callback values. Native dialog close has already happened when `onClose` runs: controlled owners must reconcile `open=false`; that notification cannot veto the native close. Action owners must honor their abort signal before their own side effects—ActionButton cannot undo arbitrary caller work.

The Dockerfile expects the root workspace lockfile to include this app. Build from repository root; deployment/routing is outside this app. No external fonts, images, secrets, storage, or build step.
