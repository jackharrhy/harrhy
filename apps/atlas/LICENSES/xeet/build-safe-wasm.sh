#!/bin/sh
# Prerequisites provisioned separately: Rust with wasm32-unknown-unknown std,
# wasm-bindgen-cli exactly 0.2.130, Cargo.lock dependencies fully cached.
# This script deliberately performs NO acquisition/install/network requests.
set -eu
ROOT=/tmp/xeet-api-review
: "${XEET_RUST_TOOLCHAIN_DIR:?absolute Rust toolchain directory with wasm std}"
: "${XEET_BINDGEN_BIN:?absolute wasm-bindgen 0.2.130 binary}"
: "${XEET_CARGO_REGISTRY:?absolute prepared cargo registry directory}"
mkdir -p "$ROOT/target" "$ROOT/build-home" "$ROOT/out"
bwrap --unshare-all --die-with-parent --new-session \
  --ro-bind /usr /usr --ro-bind /bin /bin --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --ro-bind /etc/alternatives /etc/alternatives \
  --proc /proc --dev /dev --tmpfs /tmp \
  --ro-bind "$XEET_RUST_TOOLCHAIN_DIR" /toolchain \
  --ro-bind "$XEET_BINDGEN_BIN" /wasm-bindgen \
  --ro-bind "$XEET_CARGO_REGISTRY" /cargo/registry \
  --ro-bind "$ROOT/source" /src --ro-bind "$ROOT/safe-vendor" /vendor \
  --bind "$ROOT/target" /target --bind "$ROOT/build-home" /home --bind "$ROOT/out" /out \
  --clearenv --setenv PATH /toolchain/bin:/usr/bin:/bin --setenv HOME /home \
  --setenv CARGO_HOME /cargo --setenv CARGO_TARGET_DIR /target \
  --setenv XEET_VENDOR_DIR /vendor --setenv XEET_FONT_PACKS all \
  --setenv CARGO_PROFILE_RELEASE_LTO thin --setenv CARGO_PROFILE_RELEASE_STRIP false \
  --setenv CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS '-C link-arg=--max-memory=268435456' \
  --chdir /src /bin/sh -ec '
    test "$(/wasm-bindgen --version)" = "wasm-bindgen 0.2.130"
    cargo build --offline --locked --release -p xeet-wasm --target wasm32-unknown-unknown
    /wasm-bindgen --target web --out-dir /out --out-name xeet_wasm /target/wasm32-unknown-unknown/release/xeet_wasm.wasm
    cp /src/packages/xeet/src/abi.js /out/abi.js
    cp /src/packages/xeet/src/resolve.js /out/resolve.js
    cp /src/packages/xeet/src/limits.js /out/limits.js
    cp /src/LICENSE /out/XEET-LICENSE.txt
    cp /vendor/fonts/OFL.txt /out/NOTO-OFL.txt
  '
sha256sum "$ROOT/out/xeet_wasm_bg.wasm" "$ROOT/out/xeet_wasm.js"
