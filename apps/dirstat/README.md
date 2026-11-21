# DirStat

DirStat explores allocated disk usage in a live treemap and a paged directory
inventory. The viewer uses Remix and PixiJS. The Linux preview walker streams
metadata from a read-only sandbox; it never opens file contents or deletes data.
See the [prototype architecture and access boundary](../../docs/dirstat/real-preflight.md).

`scanner/` is a separate Rust NDJSON experiment, not the current viewer backend.
Build it with `cargo build --locked --manifest-path apps/dirstat/scanner/Cargo.toml`.
[`preview/record.mjs`](preview/record.mjs) generates a synthetic fixture and
records that scanner’s output for offline experiments.

This workspace is not deployed by CI. Do not expose it without application
authentication and owner-bound authorization; network membership alone does not
protect named metadata or scan operations.
