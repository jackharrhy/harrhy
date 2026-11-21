# Atlas Xeet WASM build

Actual Rust xeet-wasm compiled from rauchg/xeet commit 9207876df382ec29f8cd5a3d0cc3671d9a9fb61e. No Rust source edits. Not X pixel parity: intentionally uses OFL Noto Sans and original simple icon stand-ins rather than X/platform fonts or X's SVG sprite.

## Inputs

Source archive: https://codeload.github.com/rauchg/xeet/tar.gz/9207876df382ec29f8cd5a3d0cc3671d9a9fb61e
SHA256 8136458189f78a9cd318e04bda4f04fa881da72c983499c0f84cc1a6f6e9326f

NotoSans-Regular.ttf and NotoSans-Bold.ttf: unchanged bytes at assets/vendor/fonts/ in the pinned source. Respective SHA256:
- f3961a9cde016d41a4879aecda1474d3a36d6bf54fa0e4643de029cc2248b0e8
- 87cb2d84472a7d66da659ee47b6cdb9552326e8c128245231f191b6ac72529d9

Their font name tables identify Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic), Noto Sans, SIL OFL 1.1. The accompanying notice NOTO-OFL.txt is from https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/ffaec0a756877220dbf718ce08b8479a0be82479/OFL.txt (SHA256 cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a).

Custom vendor manifest assigns the unchanged Regular face to renderer primary roles 400/500 and unchanged Bold to 700/800. Family metadata remains Noto Sans. Only those four entries exist. No Chirp/Arial/Apple/Hiragino files or original default avatar are embedded. Unsupported scripts/emoji may display missing glyphs.

Custom icons.json uses newly authored simple SVG geometry, not copies of X's sprite. Unimplemented decorative/brand icons use a generic square outline. These generated stand-ins may be used under the same Apache-2.0 terms as this integration. make-safe-icons.py records the complete geometry generator.

tokens.json is the pinned source's numeric/color/layout constants unchanged. No X fetches were made. Original X icon SVGs are not used in the build.

## Build

Rust 1.93.1 (01f6ddf75 2026-02-11). Task-local copy of host toolchain, no shared modification. wasm32 std downloaded from https://static.rust-lang.org/dist/2026-02-12/rust-std-1.93.1-wasm32-unknown-unknown.tar.xz, verified against official channel manifest SHA256 82bcf1e75ad071548bb97f11676b332dd260807572414553a06ee5d88d20a63e; component copied into task-local toolchain without running install scripts.

wasm-bindgen 0.2.130 prebuilt CLI: https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.130/wasm-bindgen-0.2.130-x86_64-unknown-linux-musl.tar.gz; SHA256 9687f3bb551b9f66f37ed32a40d7913a00f7962db653054e56857bc306c3227f, matches upstream sidecar.

Cargo dependencies fetched with --locked into task-local cache in a credential-free filesystem sandbox. Compilation then ran bwrap --unshare-all with no network, cleared environment, read-only source/toolchain/cache, only isolated output/home/target writable. Upstream/dependency build scripts ran only inside this offline sandbox.

XEET_VENDOR_DIR=/vendor XEET_FONT_PACKS=all CARGO_PROFILE_RELEASE_LTO=thin CARGO_PROFILE_RELEASE_STRIP=false CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS='-C link-arg=--max-memory=268435456'
cargo build --offline --locked --release -p xeet-wasm --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir /out --out-name xeet_wasm /target/wasm32-unknown-unknown/release/xeet_wasm.wasm

No SIMD flag enabled. Avoid upstream build-wasm.mjs for this configuration because its font-pack generator hardcodes the original vendor directory.

## Outputs and validation

xeet_wasm_bg.wasm: 5,179,323 bytes; SHA256 50dd9b5a450e394b5bec145ceb79139117cb84949f6b2737e31dd283d03f55ae
xeet_wasm.js: SHA256 9047e23069877ffcaf32d84236e25742da9bfdd4a8035d2cade09ac1decd3b94

Binary memory section independently parsed: one memory, initial 44 pages, maximum 4096 pages = 256 MiB. This caps WASM linear memory, not worker process/browser total memory.

Credential-free, offline Node smoke loaded real generated web glue and WASM, called call(1, JSON.stringify({op:'render',post,options})) for widths390/600 and dpr1/2. All returned successful valid 13-byte frames, PNG signatures, expected PNG widths390/780/600/1200, structured report JSON. missing_packs returned []. Smoke PNGs/log are diagnostic, not required distribution assets. No resolver was called.

## Runtime

Only xeet_wasm.js and xeet_wasm_bg.wasm are necessary if adapter invokes call directly. default init({module_or_path: fetch(wasmUrl)}) followed by call(1, JSON.stringify({op:'render',post,options})). Uint8Array returned: status byte0, u32 little-endian PNG length@1, report length@5, total length@9, PNG@13, report JSON after PNG. Validate lengths/status before use.

Also available: upstream_version, register_font, packs_for, missing_packs, resolve, resolve_links. Integration must not expose resolver exports. No lazy font packs needed. abi.js is optional convenience wrapper, importing resolve.js.

## Notices

Keep XEET-LICENSE.txt (Apache-2.0), NOTO-OFL.txt (SIL OFL1.1), TWITTER-TEXT-LICENSE.txt (Apache-2.0 vendored data provenance) and UNICODE-LICENSE.txt (Unicode License v3). Source derivation and font changes should remain explicit. The original repository warns that X/platform fonts are excluded from its Apache license; none are included here.
