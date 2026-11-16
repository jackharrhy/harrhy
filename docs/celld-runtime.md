# Common Celld runtime

Harrhy uses one qualified Celld fork artifact across containerized apps and native previews. The maintained fork follows the latest qualified upstream release with owned patches in linear history, without merge commits. Historical refs and disposable upgrade fixtures are not running-version exceptions.

## Authoritative selection

[`celld.json`](../celld.json) records the immutable image, upstream version/revision, exact fork revision, platform and extracted native binary SHA-256. The qualified selection is upstream 0.6.3 with fork release `0.6.3-jh.1`, source `140fe0e00254afd228d4e8e17c33de54c4de4a70`. The release branch/tag, not historical fork `origin/main`, identifies this linear release.

Docker cannot read a local JSON file in `FROM`, so four Dockerfiles repeat its image default. The unconditional CI test `scripts/ci/__tests__/celld-fleet.test.mjs` rejects missing, duplicate or divergent defaults and missing provenance labels. Explicit build overrides are only for isolated compatibility rehearsals, not persistent alternate fleet versions.

<!-- prettier-ignore -->
| Consumer | Selection and provenance |
| --- | --- |
| Ref | Dockerfile default; `dev.jackharrhy.ref.celld-image` label |
| Radio | Dockerfile default; `dev.jackharrhy.radio.celld-image` label |
| Worldview UI | Dockerfile default; `dev.jackharrhy.worldview.celld-image` label |
| Maps collaboration | Dockerfile default; `dev.jackharrhy.maps-collaboration.celld-image` label |
| Native 4orm preview | Operator-managed `CELLD_BIN`, verified against the common binary SHA-256 |
| Ref and Radio CI integration | Extract the common image, verify its binary SHA-256, then run isolated checks |

## Native use

From the repository root:

```sh
image=$(node scripts/celld-runtime.mjs image)
container=$(docker create --platform linux/amd64 "$image" --version)
docker cp "$container:/usr/local/bin/celld" /absolute/scratch/celld
docker rm "$container"
chmod +x /absolute/scratch/celld
node scripts/celld-runtime.mjs verify /absolute/scratch/celld
```

`scripts/celld-runtime.mjs` also exports `readCelldRuntime()` and `verifyCelldBinary(path)` for native runners. Resolve the record relative to that module, not a caller's working directory. Verify before starting a runtime or writing its store. Do not substitute a host-built development binary: the first candidate required newer glibc than the apps' Bookworm base. The final extracted release binary passed those compatibility checks without changing app bases.

## Qualification and rollout boundary

On 16 November 2026 the fork owner declared this exact artifact READY after release CI `43932856214` and exact-binary Worker EC/RFC crypto, storage/runtime and isolated 4orm push qualification. Independent offline all-four app-image checks on binary `43072e8ecb4a8aa60e91f91eac246d9b087b013f7ef2a1e35bd0556aabc0dd40` passed default-command diagnose/deploy/start, HTTP endpoints, exact built asset bodies, compiler transform, SQLite write/reopen and same-container restart. Ref served health/readiness and denied unauthenticated MCP; Worldview served viewer/editor; collaboration served health; Radio served its root.

These bounded checks are not full Ref browser/archive acceptance, Radio room/WebSocket/audio/SIGKILL acceptance, or collaboration operation/WebSocket persistence acceptance. Earlier README receipts for 0.6.2 remain historical evidence, not repeated 0.6.3 results.

Source adoption and normal image publication are not evidence of runtime adoption. The runtime operator coordinates container and native-preview convergence and verifies actual binary hashes plus app provenance. Before rollout, observed fleet runtimes were 0.6.2 with binary SHA-256 `4fb58268c1b89a2452d486615442adabb13fc0a80d4078bc2a73cafc19ad2a8b`. Do not leave a persistent mixed-version fleet.

Preserve authoritative stores, replica boundaries and existing recovery procedures; this upgrade does not require reseeding or rebuilding databases. Compatibility fixtures use disposable data, never the human-review cohort. Preserve the 4orm issuer `https://newport.hedgehog-python.ts.net:8565`; no Python cutover, Auth migration or identity relinking is authorized by this upgrade.
