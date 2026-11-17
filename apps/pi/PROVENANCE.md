# Import provenance

Source: `jackharrhy/pi`, branch `jack`, exact clean commit `2a74fd2a6c78cce7f72d27655f4d132ecf2bf236`. The import was extracted from Git objects, not the source working tree. No source edits, production operations or private data copies were performed. Handyman independently attested the baseline. Later maintenance/rebase work is not included.

`provenance.json` records SHA-256 for 3,608 imported source/public-catalog files (36,061,458 bytes). Source paths and executable modes are preserved. The eight listed operational documents are deliberately excluded because they contain private machine/deployment inventory; `apps/pi/README.md` is the current setup guide. No plugin runtime facets or user-facing plugin document identities are renamed or removed.

Included roots: `apps/p2`, `packages/{ai,chord,codemode,durable,env,mcp,schema,telemetry,tui}`, the two root TypeScript configurations, `LICENSE`, and `scripts/package-files.mjs`. Source tests and vendor assets remain intact. The upstream root package manifest is replaced by a private reduced-closure install manifest. The nested lock is derived from the exact upstream lock and pruned by npm for that manifest; it is not a new broad dependency upgrade. Root marked 18.0.11 preserves the original hoisting while the app keeps its original 18.0.14 pin.

The additional generated `packages/ai/src/providers/data/` catalog, including `.manifest.json`, was copied from the source's public generated output only after the existing validator passed. The validator also passes on the imported copy. Its hashes are in the same manifest. No auth, owner keys, model credentials, settings, session databases, user plugins or runtime configuration are imported.

The MIT source license is retained at `upstream/LICENSE` (copyright 2025 Mario Zechner). Embedded vendor notices remain alongside their assets. Installed third-party dependencies retain their distribution licenses; the nested lock records exact versions and integrity. Neither dependencies nor generated build directories are committed.

The namespace sandbox mounts only this import plus system libraries and Node (and Chromium for browser tests), with a fresh temporary HOME/data namespace and no external network. Synthetic evidence is qualification of the import, not evidence of a full real-data restore. See the explicit limitation in README.

## Operator read-only inventory (not restore proof)

The live operator separately observed a **non-atomic, partial** read-only inventory
on 2026-11-17. Thirty readable stores used Chord store schema 3, matching this
baseline; selected persisted activity v1, schedules v1 and stimuli v2 matched
source support. Thirty-two referenced blobs passed presence/size stat checks;
no blob contents were read. Six store opens and the full data-report comparison
were refused under strict read-only mounts and were not retried writable.
Logical schedule/subscription/native receipt reconstruction, those unreadable
stores, whole-instance integrity and cold restore remain unproven. The private
aggregate report stays outside Harrhy; no live IDs, names, content or credentials
are included here. No service interruption or real-data boot was performed.
