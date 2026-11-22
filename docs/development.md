# Developing Harrhy

Use Node.js 26 LTS (26.13.0 or later) and run `pnpm install --frozen-lockfile` from the repository root. The published Artbin CLI supports Node 20+ for consumers. [Img](../apps/img/README.md) also needs Rust and platform build dependencies.

The [workspace index](../README.md) links to each app and package. Use `pnpm --filter <name> run <script>` to run a workspace script; for example, `pnpm --filter @harrhy/cms run dev` starts CMS. Run `pnpm run` to list root shortcuts. Follow the [contributor guidance](../AGENTS.md) for worktrees and PR checks, and see [agent skills](agent-skills.md) for restoring managed guidance. Ref’s [logging guide](ref/guide.md#logging) links to the logging skill.

## Worktree installs

Use the pnpm version pinned in `packageManager` and `mise.toml`. Local installs share pnpm’s global virtual store by default. External dependency links resolve through `links/` under `pnpm store path`; workspace dependencies still resolve to source in the current checkout. Keep the store and its worktrees on the same filesystem for hardlinks. If a worktree lives on another filesystem, choose a writable store there with `--store-dir /path/to/store` and keep using that setting for subsequent installs.

Convert one development checkout at a time. Stop its dev servers and watchers, then inspect and move aside the root and workspace `node_modules` directories managed by pnpm before reinstalling with `pnpm install --frozen-lockfile`. Keep the old directories until you verify the new install. Leave lockfiles, source, local data and Pi’s nested `apps/pi/compat/**/node_modules` alone. Pi compat still uses npm. If you use Pi locally, rerun `node apps/pi/harrhy/install.mjs` to recreate its overlay links after replacing `apps/pi/node_modules`.

To roll back or keep a checkout self-contained, move aside its pnpm-managed directories again and run `pnpm install --frozen-lockfile --config.enable-global-virtual-store=false`. This flag overrides the workspace default; `CI=true` alone does not. GitHub workflow installs and Dockerfiles explicitly opt out. Do not copy a dependency tree linked to the global store into a deployment artifact or prune the shared store as part of conversion.

Run UI browser checks through `pnpm --filter @harrhy/ui-app run check` in either layout. The UI test entry point stages known Remix browser modules under the checkout when the pinned test harness lives in the shared store. It does not change production asset serving.

## Checks

Run `pnpm run ci:preflight` after a frozen install to reproduce CI’s formatting, typed lint and Knip checks locally. Run `node --test scripts/ci/__tests__/*.test.mjs` for selector tests and `pnpm --filter <workspace> check` for a failing app. The GitHub workflow still verifies runner setup, integration checks and image smokes.

- `pnpm run tooling:check` builds the shared Maps packages, generates missing Worker types, and runs repository formatting and typed lint checks. `pnpm run format` applies formatting; `pnpm run lint` runs typed lint.
- `pnpm run typecheck:tsrs` checks all workspaces after Worker types have been generated.
- `pnpm run knip:check` finds unused code. Review findings before removing code; browser, Worker and public-package entry points are configured in [Knip](../knip.jsonc).

[CI’s workspace selector](../scripts/ci/affected.mjs) checks changed workspaces and their consumers; shared or unknown inputs can trigger a full check. Draft and ready PRs both compare the base with the tested merge commit and run affected browser integrations. Changing review status alone does not rerun CI. Docker-backed native Celld integration runs on main or manual CI. See [container checks](node-images.md) for image validation and publication, and [the common Celld runtime](celld-runtime.md) for the qualified artifact.

## Local containers

Run `docker compose up --build -d` to start the default services behind Traefik. [Compose](../compose.yml) defines the local hostnames, ports, and profiles. Production DNS, TLS, and host setup are managed in the infrastructure repository.

- [Ref](ref/guide.md) uses a disposable local Auth issuer. [Radio](radio/guide.md) renders the lobby without real Auth; interactive sign-in requires a registered HTTPS callback.
- [Worldview](worldview/guide.md) documents its local UI, hosted service, and collaboration setup. Maps collaboration uses port 8787, so stop a separate Ref dev server before using that port.
- [Auth](../apps/auth/README.md) and [Burger](../apps/burger/README.md) have opt-in Compose profiles and require separate provider configuration for real sign-in.
- [Lists](lists/local-development.md) has a separate profile with Moto and Mailpit.

## Further reading

- [Architecture](architecture.md), [project imports](project-imports.md), and [third-party notices](../THIRD_PARTY_NOTICES.md)
- [npm publication](npm-publication.md), [UI direction](ui.md), and [UI package guide](../packages/ui/README.md)
- [Ideas](ideas.md), [World](world.md), and [Sluggers](sluggers.md)
