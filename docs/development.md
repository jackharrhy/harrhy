# Developing Harrhy

Use Node.js 26 LTS (26.13.0 or later) and run `pnpm install --frozen-lockfile` from the repository root. The published Artbin CLI supports Node 20+ for consumers. [Img](../apps/img/README.md) also needs Rust and platform build dependencies.

The [workspace index](../README.md) links to each app and package. Use `pnpm --filter <name> run <script>` to run a workspace script; for example, `pnpm --filter @harrhy/cms run dev` starts CMS. Run `pnpm run` to list root shortcuts. Follow the [contributor guidance](../AGENTS.md) for worktrees and PR checks, and see [agent skills](agent-skills.md) for restoring managed guidance. Ref’s [logging guide](ref/guide.md#logging) links to the logging skill.

## Worktree installs

Use the pnpm version pinned in `packageManager` and `mise.toml`. For disposable development worktrees on the same host, use `pnpm install --frozen-lockfile --config.enable-global-virtual-store=true` to reuse installed packages across checkouts. Do not point production or container builds at a host store: their dependency trees must be self-contained. Pi’s nested `apps/pi/compat` install remains on npm.

## Checks

- `pnpm run tooling:check` builds the shared Maps packages, generates missing Worker types, and runs repository formatting and typed lint checks. `pnpm run format` applies formatting; `pnpm run lint` runs typed lint.
- `pnpm run typecheck:tsrs` checks all workspaces after Worker types have been generated.
- `pnpm run knip:check` finds unused code. Review findings before removing code; browser, Worker and public-package entry points are configured in [Knip](../knip.jsonc).

[CI’s workspace selector](../scripts/ci/affected.mjs) checks changed workspaces and their consumers; shared or unknown inputs can trigger a full check. Ready PRs run the full comparison and eligible browser and Celld integration tests. See [container checks](node-images.md) for image validation and publication, and [the common Celld runtime](celld-runtime.md) for the qualified artifact.

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
