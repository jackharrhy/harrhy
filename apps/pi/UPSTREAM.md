# Updating the Pi source

## Source boundary (restructuring in progress)

Pi is first-class Harrhy source, with upstream file names, formatting, import specifiers and module identities retained. It is not an independently developed external app. The intended path map is:

<!-- prettier-ignore -->
| Pi source | Harrhy source |
| --- | --- |
| `apps/p2/{src,plugins,scripts,public,voice-server}/**` | `apps/pi/{src,plugins,scripts,public,voice-server}/**` |
| `packages/X/**` (retained compatibility packages) | `apps/pi/compat/packages/X/**` |
| App qualification tests | `apps/pi/__tests__/p2/**` |
| Root license | `apps/pi/LICENSE` |

Harrhy-only startup, sandbox and qualification adapters belong in `apps/pi/harrhy/`, not upstream's `scripts/`. The compatibility directory is an isolated npm boundary, not a tarball store or source-download mechanism. Normal installs must work from this checkout and registry dependencies alone. Preserve nested React/marked/type identities rather than relying on Harrhy root hoisting. Exact package selection and the replacement lock remain under validation; the old `upstream/` copy is temporary, not a second implementation to retain.

Keep app files and package-internal relative paths unchanged. Limit topology adaptations to manifests, TypeScript aliases, the source resolver and host asset/build entry points. Keep `@p2/app/v1` and subpaths a single host-owned module identity; do not rewrite plugin imports, wire IDs, receipts or deduplication contracts. Record each actual adapter in provenance when the restructuring is complete. Do not run a bulk formatter over retained source.

## Baselines and custom changes

The imported customized baseline is `jackharrhy/pi` commit `2a74fd2a6c78cce7f72d27655f4d132ecf2bf236`. Its common ancestor with the investigated upstream cohort is `ac78a6068b38774fceb5157c8f9e27fba9da6471`. The upstream repository is `earendil-works/pi`; the customized fork is `jackharrhy/pi`. Preserve both references when reviewing updates: a tip-to-tip diff alone confuses later upstream work with custom changes. These are historical references, not a runtime network dependency or a claim that a particular remote branch still points at them.

The custom cohort principally changes P2 and MCP recovery. Keep those source changes distinguishable from Harrhy's small topology/qualification adapters. Original source copyright and license, plus embedded third-party notices, must remain with the source.

## Boring update procedure

1. In a separate temporary repository outside this checkout, fetch the exact old baseline and proposed upstream ref. Resolve and record full commit IDs. Never update from an unrecorded moving branch. This maintenance fetch is not part of install, build or runtime.
2. Inspect `git diff --stat OLD NEW -- apps/p2 packages` and `git log OLD..NEW -- apps/p2 packages`. Also inspect the custom cohort with `git log COMMON..CUSTOM -- apps/p2 packages/mcp` and its scoped diff. Do not touch the live Pi checkout or its data.
3. Review selected commits and produce a scoped patch with `git diff --binary OLD NEW -- <selected paths>`. Map the table's prefixes literally, retaining the remaining path components. Check the mapped patch with `git apply --check` in a clean Harrhy task checkout, then apply reviewed hunks. Resolve conflicts against custom behavior; do not blindly overwrite directories. No new sync framework is required.
4. Update retained tests and the explicit include/exclude provenance together. Operational/private inventory documents, unrelated workspace trees, large fixture suites and generated build outputs are intentionally outside the production closure. Omission is not permission to remove app features. For an update, rehearse relevant omitted upstream tests in the separate maintenance checkout with synthetic data, and record results.
5. Reinstall from the nested lock; run app typechecking, catalog validation, runtime/restart/receipt/dedup tests and real Chromium checks. Check host/browser resolver agreement and the singleton ABI. Review package/native asset changes and licenses. Run root affected-workspace/tooling checks without reformatting imported files.
6. Record the new baseline, selected upstream commits, exclusions, adapters and evidence in provenance and the PR. A source update never authorizes publication, production startup, real-data boot, merge, deployment or cutover.

The focused test closure remains in `__tests__/` under Harrhy's convention. Moving tests is a documented test-only mapping, not an invitation to rename implementation files. The private synthetic preview uses fresh data and explicit isolation; it is not real-data restore proof.
