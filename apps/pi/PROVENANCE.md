# Source provenance

Customized source: `jackharrhy/pi`, exact clean commit `c4c9758f059acef538e700bb86ac451fca8b9c16`, independently attested by the live operator. Source was extracted from Git objects, not copied from private runtime directories. The investigated upstream/custom common ancestor is `ac78a6068b38774fceb5157c8f9e27fba9da6471`. See [UPSTREAM.md](UPSTREAM.md) for the path map and update process.

App runtime, plugins, public assets, original scripts and voice sidecar live directly in this app. Nine shared compatibility packages retain their original package names and internal topology under `compat/packages/`. Their source and native build inputs are local; no external app fork, custom published artifact, source-fetching build or opaque archive is required. Compatibility packages remain app-owned implementation inputs, not new independent Harrhy products.

`provenance.json` pins SHA-256 tree digests of retained source, guides, focused tests and public catalog. Its digest format is explicit and checked by `__tests__/provenance.test.mjs`. It also records the baseline hashes of the six changed retained implementation/test files:

- `src/runtime/fetch.ts`: opt-in `HARRHY_PI_HTTP_PROXY` with fixed loopback bypass; direct HTTP/1.1 remains the default.
- `src/source-resolver.ts`: compatibility-root aliases with app-root containment, retaining the host-owned `@p2` singleton.
- `src/hosts/dev-modules.ts`: local compatibility package path.
- `plugins/terminals/daemon.ts`: local native daemon package path.
- `plugins/prompt/worker.ts`: agent guidance points to Harrhy's retained guides and preserves upstream-compatible editing.
- `__tests__/p2/web-sources.test.ts`: path-mapped source-resolution comparison.

Harrhy-only adapters live in `harrhy/`. Root/app TypeScript and npm manifests express the same source aliases and isolated dependency identities in the new topology. The nested lock is derived from the pinned source lock and reconciled for the moved workspaces; dependencies are installed without lifecycle scripts. TypeScript 5.9 checks the app; the retained compatibility build toolchain is separate. Root marked 18.0.11 and app-local marked 18.0.14 preserve the original type boundary.

## Included and excluded inputs

App `src`, `plugins`, `public`, `scripts`, `voice-server` and non-private guides are retained. Compatibility packages include source, manifests, build configurations, native inputs and third-party notices, but omit their broad test/example/docs trees. App tests are a focused runtime/browser closure under `__tests__/p2` with required fixtures. Omitted upstream tests can be rehearsed separately during updates; they are not required runtime inputs. No runtime plugin facets or user-facing plugin document identities are removed or renamed.

Private inventory exclusions remain upstream app `README.md`, `DEV.md`, `docs/{handoff,p2-notes,p3-handoff}.md`, `docs/research/chord-trace-history.md`, and package Chord `docs/{benchmarks,decisions}.md`. Unrelated upstream workspaces, dependency directories and generated build output are excluded. The additional generated AI provider catalog, including its public `.manifest.json`, was copied only after the existing catalog validator passed. No auth, keys, credentials, settings, sessions, private plugins or runtime configuration are imported.

The original MIT license (copyright 2025 Mario Zechner) is retained at `LICENSE`. Embedded notices remain alongside their assets; registry dependencies retain their distribution licenses. No dependency or generated build directory is committed.

The Harrhy Previews and optional integration changes are source-only ports on top of the pinned fork snapshot. The `integrations` digest covers the matching adapter code, not installed plugins or instance configuration.

## Evidence boundary

Synthetic tests run in a fresh Bubblewrap filesystem/network namespace, without host HOME, production data or outbound network. They qualify source behavior, not a real-data restore. The separate private preview must preserve those isolation principles and owner authentication.

**Real-data rehearsal is NOT DONE.** The live operator's 2026-11-17 inventory was partial and non-atomic: thirty readable stores matched Chord schema 3; selected activity v1, schedules v1 and stimuli v2 matched source support; thirty-two blob presence/size stat checks passed without reading contents. Six store opens and full-report comparison were refused under strict read-only mounts and not retried writable. Logical receipt/subscription reconstruction, whole-instance integrity and cold restore remain unproven. The private aggregate report stays outside Harrhy. No live IDs, content, credentials, service interruption or real-data boot are included.
