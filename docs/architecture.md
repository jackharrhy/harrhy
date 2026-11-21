# Architecture

Harrhy is a Remix 3 monorepo of independently deployable apps and importable packages, listed in the [root README](../README.md). Apps own runtime configuration and deployment artifacts. Packages use named workspace imports and never import apps. Keep app-only behavior in the app. Extract a package when another consumer needs it or independent hosts will embed it.

Use `remix/routes` for typed URLs, `remix/router` for controllers and middleware, and `remix/component` for UI. Start with a working server response, then add browser behavior. Node and Cloudflare hosts use Remix 3 with their own runtime adapters and storage.

## Browser data and durable coordination

Use Cap’n Web by default for first-party browser reads, mutations, and subscriptions. After Remix loads the document, open an authenticated session scoped to resources the caller can use. The owning app defines operations and authorization; avoid a parallel JSON API. Keep native HTTP for documents, auth redirects, and file transfers.

Use [`@harrhy/live-state`](../packages/live-state/README.md) for realtime state over Cap’n Web. Ref’s [browser watcher](../apps/ref/app/cursors/browser.ts), [server channel](../apps/ref/app/cursors/room.ts), and [RPC contract](../apps/ref/app/cursors/api.ts) show the pairing. The [live-board discussion build](ref/live-board-discussion.md) documents the opt-in example; its transport layout is not a template. The app owns authorization, revisions, snapshot limits, and subscription lifetime.

Prefer the [qualified Celld runtime](celld-runtime.md) for new self-hosted durable coordination and Durable Objects for deliberately Cloudflare-native apps. Key cells by the unit of consistency, such as a board or room. Verify the runtime guarantees you rely on; don’t assume cross-cell atomicity or Cloudflare parity.

## Workspace conventions

Put standalone first-party guides and plans in `docs/`, grouped by workspace where useful. Use lowercase kebab-case Markdown filenames there. Keep workspace `README.md` and `AGENTS.md` at their entry points, and leave vendored, licensing, and published-package files in place.

Keep Markdown tables unpadded and put `<!-- prettier-ignore -->` immediately before each table so OxFmt leaves the source easy to edit.

Prefix first-party environment settings with `HARRHY_`; use `HARRHY_AUTH_*` for Auth integration and an app-specific prefix where settings differ. Preserve platform and third-party environment contracts. Coordinate existing setting renames with their deployed consumers; never rename secret values or silently change runtime behavior.

Prefer interfaces, plain objects, and functions that close over private state. Do not add TypeScript `namespace` declarations or classes just to group functions or state. Use a class only when an external API requires one.

Put tests and test-only fixtures in `__tests__/` beside the code they cover. Put host integration and browser tests in the app's `__tests__/`. Do not use a root `tests/` directory or put `*.test.*` and `*.spec.*` beside implementation files. Keep those suffixes inside `__tests__/` for discovery. Production code must not import tests.

Start new apps at `apps/<name>` as `@harrhy/<name>`. Follow the route, controller, and entry-point layout of the closest existing Remix app on the same runtime. Declare dependencies in the app’s `package.json` and run pnpm from the root. Give each new workspace a README with its purpose, entry points, and links to detailed guides, and add it to the root README table. Put Node and Cloudflare runtime rules in the workspace guide.

Give each new app or independently checked package a `check` script with typechecking and relevant tests. CI discovers these scripts and runs affected checks after one install, following workspace dependencies. Add app-specific CI steps only for external setup. Run checks for affected workspaces and their consumers when a package interface changes.

## Apps today

`apps/cms` owns the Node CMS: routes, storage, editor, operator dashboard, and site presentations in `sites/<id>`. It registers each site's presentation, manifest, and assets at startup, then exports presentations by subpath. `apps/cms-edge` is a separate Cloudflare Worker CMS with D1 and R2 storage. `packages/rich-text` owns TipTap and the Inline document format. Site selection, draft/publish rules, previews, and media checks belong to each CMS app.

`packages/mcp` provides Streamable HTTP transport and MCP tools and resources for CMS and other consumers. Each app owns its own routes, authentication, and runtime policy.

Root [`compose.yml`](../compose.yml) runs local containers behind Traefik on `.localhost`. Independent VPS containers are the default deployment target; CMS also has a Cloudflare Worker path. Keep Dockerfiles with their apps and add containerized apps to root compose. This repo owns app Dockerfiles and Worker configuration; the infrastructure repo owns production routing, DNS, secrets, host units, and live state.

References: [Remix guides](https://guides.remix.run/), [Sergio Xalambrí's monorepo](https://github.com/sergiodxa/monorepo), [The Remix Way talk](https://remix.run/jam/2026), [Pitlane Cloudflare guide](https://pitlane.tools/deploy/cloudflare).
