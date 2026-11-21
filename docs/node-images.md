# Node container checks

The deployed Node apps use prebuilt `platformatic/node-caged:26-slim` in both stages (Debian Trixie). Local development and CI use Node 26 LTS through the root `.nvmrc`. The runtime creates `node` explicitly at UID/GID 1000 because this base does not provide that account.

<!-- prettier-ignore -->
| Dockerfile under `apps/` | Runtime | Short image / scope |
| --- | --- | --- |
| `cms` | Node + `remix/node-tsx`, built-in SQLite | `teacms`, Mug |
| `auth` | Node + Remix, built-in SQLite | `auth`, Newport |
| `artbin` | Node + `remix/node-tsx`, better-sqlite3, sharp, Chromium | `artbin`, Newport |
| `letters-to-steve` | `npm start` → Node + `remix/node-tsx`, built-in SQLite, sharp | `letters-to-steve`, Newport |
| `marky` | `npm start` → Node + `remix/node-tsx`, filesystem/Git/WebSocket | `marky`, Newport |
| `rotund` | Node + Remix, static face and favicon | `rotund`, Newport |
| `8mb` | Node + Remix, local media workers and opt-in aggregate SQLite | `8mb`, Mug |
| `maps-service` | Node, built-in SQLite | `worldview-service`, Newport |
| `maps-compiler` | Node; external native executables are not bundled | `worldview-compiler`, Newport (including Gower instance) |
| `maps` | Celld Worker; Node builds/deploys it | `worldview`, Newport |
| `maps-collaboration` | Celld Worker; Node builds/deploys it | `worldview-collaboration`, Newport |
| `ref` | Celld Worker; Node builds/deploys it | `ref`, Newport |
| `radio` | Celld Worker; Node builds/deploys it | `radio`, Newport |

The table covers Node-hosted apps and the Celld Workers built with Node 26. Burger, Gurgur, and Pool also use Node 26 in their build stages and Bun in their runtime stages. The published Artbin CLI remains compatible with Node 20+ for consumers; Harrhy builds and checks it on Node 26. All short images use `ghcr.io/jackharrhy/`. Keep previous image packages and their tags available for rollback until each runtime is switched and accepted.

## Image dependency policy

Copy the lockfile, root manifest, `.npmrc`, required workspace manifests and any
install-hook inputs before installing dependencies. Use selected `pnpm --filter <workspace>... install --frozen-lockfile`
installs; copy only that app and its workspace closure after the dependency layer.
Keep revision build arguments after installation. Radio alone needs its icon-font
postinstall script before installation. Update these inputs when dependencies or
install hooks change. Builders that use root `tsrs` opt into root tools explicitly.
`.dockerignore` excludes local worktrees as well as dependencies and runtime data.

Runtime images should contain the app's known selected workspace/dependency closure,
not the full monorepo by default. Narrow each existing image with its actual startup
and asset checks; do not introduce a shared image framework to hide the differences.
Celld apps deploy at startup and still need the deploy compiler (including esbuild),
Worker source/configuration and built assets. Node source-loader apps need their raw
imports, migrations and SQL. Preserve native bindings and dynamic assets such as
Pierre WASM. Artbin intentionally retains Chromium, SwiftShader/WebGPU, fonts and
image tooling; Lists already has a selected runtime closure. Builder reductions for
Bun apps do not imply a smaller Bun runtime. Copy inherited root configuration too:
Garden's real default command requires `tsconfig.base.json` through the UI package.

Ref, Radio, Worldview and Maps collaboration retain their selected development
dependencies because startup needs esbuild and Radio supports dynamically imported
Azure storage. They exclude unrelated workspaces, not every development tool. The
two Maps Worker builders add root tools in a separate build stage; their runtimes
use the earlier selected dependency stage, preserving nested installs. CMS and the
Node Maps services prune development dependencies including root build tools. They
use built-in SQLite and no longer install or rebuild unrelated better-sqlite3.
Artbin's better-sqlite3 rebuild and sharp/browser runtime remain unchanged.

## Native modules

The current better-sqlite3 13 package uses N-API, unlike older V8/NAN releases. Nevertheless, builders that install it remove its prebuilds and invoke npm's bundled node-gyp directly with `--nodedir=/usr/local --jobs=2`. This uses the compression-enabled headers/config shipped with the actual runtime, does not download stock Node headers, and ensures the rebuilt binding is loaded instead of a preferred prebuild. Sharp remains on its N-API binary. Keep the SQLite write/reopen and sharp encode/decode checks when updating either dependency. Do not assume a matching Node module ABI alone makes a V8/NAN addon safe.

Artbin's selected install also includes root dev tools: its renderer build needs the root `tsrs` executable. Workspace selection and production pruning otherwise remain intact.

## Reproduce

```sh
app=artbin # cms, auth, letters-to-steve, marky, rotund, 8mb, maps-service, maps-compiler
docker build -f "apps/$app/Dockerfile" -t tea-smoke .
node scripts/ci/node-image-smoke.mjs "$app" tea-smoke
# The same compiler image also serves Gower:
node scripts/ci/node-image-smoke.mjs maps-compiler tea-smoke gower
```

The smoke starts the real image command with no host mounts, ports or network, then checks Node 26, pointer compression, UID, loader startup, HTTP/auth boundaries and applicable migrated databases/native bindings. Disposable container layers are removed even on assertion failure. Compiler checks deliberately assert unconfigured health/compile responses: they do not call production toolchains, OAuth, game launches or remote services.

The CI Node image matrix selects from nine images on every PR,
then builds affected images in parallel without publishing. All nine named matrix
checks remain present; unselected rows skip Docker work. The selector includes
before/after transitive workspace dependencies and explicit Docker context inputs.
CMS, Maps service and Maps compiler now copy selected workspaces; unrelated app
changes no longer select them once both compared revisions use selected inputs.
Root/runtime inputs, unknown workspaces, comparison errors and manual dispatch
select all nine. An empty diff selects none. Run
`node --test scripts/ci/__tests__/*.test.mjs` for selector and Docker input regressions. The Rotund smoke reaches its actual compiled server over HTTP and checks the original face and favicon byte hashes. The 8mb smoke checks the editor and diagnostics request boundary. It never logs into a registry or publishes.

The selected runtime image matrix builds the four Celld and three bundled Bun
images in parallel. Its network-isolated smoke runs each default CMD, checks HTTP and
exact emitted asset bodies, exercises startup esbuild and the Radio Azure import,
checks SQLite write/reopen and restarts the same disposable container. Celld
restarts wait 15 seconds for the stopped node's default 10-second lease to expire
before startup diagnostics; this is not an immediate-restart recovery test. It does
not replace browser, authenticated collaboration or live Azurite acceptance tests.
Garden retains its real-CMD fixture and highlighting smoke. These checks
do not publish images or change normal publishers/updaters.
