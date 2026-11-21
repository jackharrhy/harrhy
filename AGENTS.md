# Harrhy contributor guidance

Harrhy is a Remix 3 monorepo of independently deployable apps and importable packages. The [root README](README.md) lists them. Before editing a workspace, read its README and any local `AGENTS.md`. Use the workspace README to explain what it is, point to the main entry points, and link to detailed guides in `docs/`. Add a README and a root table row for each new workspace.

<!-- prettier-ignore -->
| Location | Responsibility |
| --- | --- |
| `apps/*` | Deployable products: routes, UI, storage, runtime configuration, and presentation |
| `packages/*` | Shared modules and intentionally embeddable runtimes |
| `docs/*` | Architecture and product guides that span individual files |

## Parallel task workflow

Read the shared `worktrees` skill (`~/.agents/skills/worktrees/SKILL.md`) before creating, removing, or relocating task worktrees. Keep the generic recipe there; Harrhy-specific workflow rules follow.

Use the primary checkout for uncontended single-writer tasks; use a separate worktree when concurrent writers or concrete isolation needs justify it. Start task branches from freshly fetched `origin/main`. Do not share an editing checkout between concurrent writers. Agents may create their own worktrees when needed, push PRs, and review and merge their own owner-authorized work; no coordinator permission, locks, holds, or central ownership registry is required.

Keep dependencies, generated output, caches, runtime state, and build directories isolated per worktree. Give concurrent servers distinct ports. Do not change another task's checkout. Retry ordinary Git/GitHub races; update or rebase for actual conflicts, integration validation, or GitHub requirements, then rerun affected checks.

Use the [PR description skill](.agents/skills/pr-description/SKILL.md) when opening or revising a pull request's title and body.

Before merging, mark the PR ready, review its diff, run applicable local checks, and verify all expected PR workflows completed successfully on the exact current head. Draft checks have reduced coverage. Do not rely on required-only check queries: required checks are not currently enforced by GitHub. Do not bypass failures or safeguards.

Ask for owner review through Familiar only for a specific unresolved product, security, or destructive decision, with the PR link and reason. Otherwise self-merge within the approved scope and notify Harrhy of the result. Remove finished worktrees once their work is preserved and private state and active users have been checked; never force removal to discard unknown data.

Shared-runtime operations may need serialization by their operator; that does not reserve source files or gate independent source work. No GitHub auto-merge setting or custom status subscription is needed for this workflow.

## Celld runtime policy

Keep the Celld fork on the latest qualified upstream release with a linear series of owned patches; do not add merge commits to the maintained fork branch. Preserve required standalone-storage and security fixes when updating upstream.

All Harrhy Celld apps and native previews must converge on one qualified immutable artifact. Do not leave per-app runtime version exceptions. Qualify the fork and publish its artifact before changing app pins; coordinate the fleet transition with the runtime operator, including native CLI binaries and preview supervisors. Disposable compatibility tests may exercise older or candidate binaries without changing the shared runtime selection. A source pin change is not proof that an image was published or a running service upgraded. See [the runtime inventory](docs/celld-runtime.md).

## Code and workspace conventions

Put standalone first-party guides and plans in `docs/`, grouped by workspace where useful. Use lowercase kebab-case Markdown filenames there. Keep workspace `README.md` and `AGENTS.md` at their entry points, and leave vendored, licensing, and published-package files in place.

Keep Markdown tables unpadded and put `<!-- prettier-ignore -->` immediately before each table so OxFmt leaves the source easy to edit.

Apps import packages; packages must not import apps. Use Remix 3 for app routing, controllers, middleware, and UI. Read the [Remix skill](.agents/skills/remix/SKILL.md) and relevant installed guides before changing framework behavior. Put Node and Cloudflare runtime rules in the relevant workspace guide.

Write first-party application source and tests in TypeScript (`.ts`, or `.tsx` for JSX). Use TypeScript directly rather than adding JSDoc types to JavaScript in a TypeScript workspace. Keep new app code inside the workspace's `tsconfig.json` and its typecheck. Use JavaScript only where a tool, runtime, or external consumer actually expects it; explain that exception in the workspace guide. Leave generated and imported code in its existing format.

For a new app, use `apps/<name>` and `@harrhy/<name>`. Start from the nearest existing Remix app with the same runtime. Follow its route, controller, and entry-point layout; declare dependencies in the app's `package.json` and use pnpm from the repository root. Include typechecking and relevant tests in the workspace `check` script rather than adding a separate CI job by default.

Prefix first-party environment settings with `HARRHY_`; use `HARRHY_AUTH_*` for Auth integration and an app-specific prefix where settings differ. Preserve platform and third-party environment contracts. Coordinate existing setting renames with their deployed consumers; never rename secret values or silently change runtime behavior.

Keep Auth entry links and session-changing forms native with Remix's `data-rmx-document` attribute. Same-origin routes can redirect to another origin; they must not be fetched as frame navigation. Shared `ButtonLink` forwards this attribute. Keep ordinary internal navigation client-side; follow [the document navigation guide](docs/remix-navigation.md) and test actual hydrated clicks, not just rendered markup.

Use Remix `css(...)` mixins for static UI styles. Keep inline `style` for values computed at runtime. A small stylesheet is fine for CSS features the mixin cannot express, such as `@font-face`.

Keep behavior owned by one app inside that app, even when it has a clean internal interface. Extract a package when another consumer needs it or the module is meant to be embedded by independent hosts.

Prefer interfaces, plain objects, and functions that close over private state. Do not add TypeScript `namespace` declarations or classes just to group functions or state. Use a class only when an external API requires one.

Put tests and test-only fixtures in `__tests__/` beside the code they cover. Put host integration and browser tests in the app's `__tests__/`. Do not use a root `tests/` directory or put `*.test.*` and `*.spec.*` beside implementation files. Keep those suffixes inside `__tests__/` for discovery. Production code must not import tests.

Run checks for each affected workspace and its consumers when a package interface changes. Keep Dockerfiles with their apps; add containerized apps to root `compose.yml`. Host configuration, DNS, secrets, and production operations live in another repo.

Give each new app or independently checked package a `check` script in its workspace manifest. CI discovers it, follows workspace dependencies, and runs affected checks after one install. Add app-specific CI steps only when its check needs external setup.

## Managed agent skills

Run `mise run skills` to restore locked project guidance; see [setup and scope](docs/agent-skills.md). Official Cloudflare skills supplement, never replace, first-party logging and Remix guidance.
