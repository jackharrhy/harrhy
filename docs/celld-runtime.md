# Common Celld runtime

Harrhy uses one qualified Celld fork artifact across containerized apps and native previews. The maintained fork follows the latest qualified upstream release with owned patches in linear history, without merge commits. Historical refs and disposable upgrade fixtures are not running-version exceptions.

## Current inventory

Observed on 16 November 2026, before the proposed 0.6.3/P-256 upgrade:

<!-- prettier-ignore -->
| Consumer | Current selection | Upgrade boundary |
| --- | --- | --- |
| Ref | Dockerfile `CELLD_IMAGE` digest | App image and runtime |
| Radio | Dockerfile `CELLD_IMAGE` digest | App image and runtime |
| Worldview UI | Dockerfile `CELLD_IMAGE` digest | App image and runtime; add missing provenance label |
| Maps collaboration | Dockerfile `CELLD_IMAGE` digest | App image and runtime |
| Native 4orm preview | Operator-managed executable selected by `CELLD_BIN` | Preview supervisor and its native tool binary |
| Ref and Radio integration checks | CI extracts their Dockerfile pins; runners also accept native binary paths | CI extraction and local test instructions |
| 4orm acceptance runners | `CELLD_BIN` or private candidate `tools/celld` paths | Shared native artifact mapping; keep disposable stores isolated |

The four Dockerfiles select `ghcr.io/jackharrhy/celld@sha256:0d63d5e360981f9e779c44b144abddb4ca174fc37630a80da7ddc57670c3f970`. Infra reported all four live app runtimes and the native 4orm preview on Celld 0.6.2. The native binary's SHA-256 was `4fb58268c1b89a2452d486615442adabb13fc0a80d4078bc2a73cafc19ad2a8b`. Version output alone does not distinguish fork patches.

The 0.6.3 fork and raw P-256 repair are being qualified separately. No replacement artifact is selected here yet. A fresh isolated 4orm probe still reproduced the old binary's unsupported raw-key import and incorrect 91-byte raw public-key export; this is not evidence against an untested replacement.

## Upgrade scope

Keep one small authoritative artifact record and check Dockerfile defaults against it in CI. CI binary extraction and native preview instructions must use the same selection. Record the qualified fork source, upstream version, immutable image digest and native binary identity together rather than inferring identity from `celld --version`.

Before consuming a replacement, obtain fork qualification results and the published immutable artifact from the fork owner. Keep normal app build and publish workflows; do not introduce a separate build platform. Coordinate actual container and native-preview adoption with the runtime operator, then verify the running binaries and app image provenance. A temporary rollout must converge to the same version, not become persistent mixed-version operation.

Compatibility and upgrade tests may explicitly use another binary against disposable data. Never point those tests at the human-review cohort. Preserve the 4orm fixture issuer and identity links; a Celld upgrade does not authorize a Python cutover, cohort reseed or Auth migration.
