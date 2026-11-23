# Updating the Pi source

## Source boundary

Pi is first-class Harrhy source, with upstream file names, formatting, import specifiers and module identities retained. It is not an independently developed external app. The path map is:

<!-- prettier-ignore -->
| Pi source | Harrhy source |
| --- | --- |
| `apps/p2/{src,plugins,scripts,public}/**` | `apps/pi/{src,plugins,scripts,public}/**` |
| `packages/X/**` (retained compatibility packages) | `apps/pi/compat/packages/X/**` |
| App qualification tests | `apps/pi/__tests__/p2/**` |
| Root license | `apps/pi/LICENSE` |

Harrhy-only startup, sandbox and qualification adapters belong in `apps/pi/harrhy/`, not upstream's `scripts/`. The compatibility directory is an isolated npm boundary, not a tarball store or source-download mechanism. Normal installs must work from this checkout and registry dependencies alone. Preserve nested React/marked/type identities rather than relying on Harrhy root hoisting. All eight compatibility packages (ai, chord, codemode, durable, env, mcp, schema and telemetry) are retained locally; the relocated lock and focused checks are validated. The superseded `upstream/` copy is removed.

Keep app files and package-internal relative paths unchanged. Limit topology adaptations to manifests, TypeScript aliases, the source resolver and host asset/build entry points. Keep `@p2/app/v1` and subpaths a single host-owned module identity; do not rewrite plugin imports, wire IDs, receipts or deduplication contracts. Record each actual adapter in provenance when the restructuring is complete. Do not run a bulk formatter over retained source.

## Import history and local behavior

Harrhy is the source of truth. Import selected upstream changes in normal Harrhy PRs; do not rebase Harrhy onto Pi or update the retired fork as an intermediate step. See [LOCAL-CHANGES.md](LOCAL-CHANGES.md) for intentional differences.

The imported customized baseline is `jackharrhy/pi` commit `c4c9758f059acef538e700bb86ac451fca8b9c16`. Its common ancestor with the investigated upstream cohort is `ac78a6068b38774fceb5157c8f9e27fba9da6471`. The upstream repository is `earendil-works/pi`; the customized fork is `jackharrhy/pi`. Preserve both references when reviewing updates: a tip-to-tip diff alone confuses later upstream work with custom changes. These are historical references, not a runtime network dependency or a claim that a particular remote branch still points at them.
The original imported snapshot was based on upstream commit `05fd3fbda0bbb9a1c7a76e4bf92ab58ed77c8d94`. The first update from `2a74fd2` applies the scoped fork diff, including new retained source files, and regenerates the public model catalog. It does not import the separate coding agent, macOS client, or the full upstream test tree.

The retained `src/runtime/fetch.ts` also has a recorded Harrhy runtime adaptation: `HARRHY_PI_HTTP_PROXY` opts into a proxy with fixed loopback bypass while preserving direct HTTP/1.1 by default. This setting does not enforce destination restrictions; a preview's restricting proxy and sandbox own that boundary. Preserve this adaptation and its focused test when updating the pinned baseline.

The custom cohort principally changes P2 and MCP recovery. Keep those source changes distinguishable from Harrhy's small topology/qualification adapters. Original source copyright and license, plus embedded third-party notices, must remain with the source.

## Boring update procedure

1. In a separate temporary repository outside this checkout, fetch the exact old baseline and proposed upstream ref. Resolve and record full commit IDs. Never update from an unrecorded moving branch. This maintenance fetch is not part of install, build or runtime.
2. Inspect `git diff --stat OLD NEW -- apps/p2 packages` and `git log OLD..NEW -- apps/p2 packages`. Read `LOCAL-CHANGES.md` and the previous import PR. Consult the historical fork only to explain inherited differences. Do not touch the live Pi checkout or its data.
3. Review selected commits and produce a scoped patch with `git diff --binary OLD NEW -- <selected paths>`. Map the table's prefixes literally, retaining the remaining path components. Check the mapped patch with `git apply --check` in a clean Harrhy task checkout, then apply reviewed hunks. Resolve conflicts against custom behavior; do not blindly overwrite directories. No new sync framework is required.
4. Update retained tests and the explicit include/exclude provenance together. Operational/private inventory documents, unrelated workspace trees, large fixture suites and generated build outputs are intentionally outside the production closure. Omission is not permission to remove app features. For an update, rehearse relevant omitted upstream tests in the separate maintenance checkout with synthetic data, and record results.
5. Reinstall from the nested lock; run app typechecking, catalog validation, runtime/restart/receipt/dedup tests and real Chromium checks. Check host/browser resolver agreement and the singleton ABI. Review package/native asset changes and licenses. Run root affected-workspace/tooling checks without reformatting imported files.
6. Record the selected upstream commits and their mapped scope, exclusions, adapters and evidence in provenance and the PR. A partial import does not advance the baseline for untouched files. Update `LOCAL-CHANGES.md` when intentional behavior changes.

## Applying a qualified revision

Build from the exact reviewed Harrhy commit, not from a dirty worktree or a moving branch. For a running instance, use its supervised `harrhy/run-server.mjs` launcher rather than the disposable `npm start` sandbox. Keep the installation separate from `P2_DATA_DIR`; never edit the installed source to ship a change. Before a planned restart, record the running revision and check storage compatibility in both directions. Preserve the old launcher and a verified cold backup when storage compatibility is uncertain. Verify the installed revision, owner access and changed behavior after the restart. Qualify and coordinate each instance separately.

The focused test closure remains in `__tests__/` under Harrhy's convention. Moving tests is a documented test-only mapping, not an invitation to rename implementation files. The private synthetic preview uses fresh data and explicit isolation; it is not real-data restore proof.
