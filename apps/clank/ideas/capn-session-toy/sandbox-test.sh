#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
node_bin=$(realpath "${NODE_BIN:-$(command -v node)}")
[[ -x "$node_bin" ]]
mkdir -p .sandbox
ulimit -t 20 -f 32768
exec timeout -k 2s 30s bwrap --unshare-net --unshare-pid --die-with-parent --new-session --clearenv \
  --ro-bind /usr/lib /usr/lib --symlink usr/lib /lib --symlink usr/lib/x86_64-linux-gnu /lib64 \
  --ro-bind "$node_bin" /bin/node --ro-bind "$PWD" /src --bind "$PWD/.sandbox" /work \
  --dev /dev --proc /proc --setenv HOME /work --setenv TMPDIR /work --setenv UV_THREADPOOL_SIZE 2 \
  --chdir /work /bin/node --max-old-space-size=128 --test /src/__tests__/wire.test.js
