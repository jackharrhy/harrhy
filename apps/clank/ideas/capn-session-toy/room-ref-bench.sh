#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
[[ "${1:-}" =~ ^[0-9]+$ && "${2:-}" =~ ^[0-9]+$ && "$1" != "$2" ]]
node_bin=$(realpath "${NODE_BIN:-$(command -v node)}")
mkdir -p .sandbox
ulimit -t 20 -f 32768
exec timeout -k 2s 30s taskset -c "$1" bwrap --unshare-net --unshare-pid --die-with-parent --new-session --clearenv \
  --ro-bind /usr/lib /usr/lib --symlink usr/lib /lib --symlink usr/lib/x86_64-linux-gnu /lib64 \
  --ro-bind "$node_bin" /bin/node --ro-bind "$(command -v taskset)" /bin/taskset \
  --ro-bind "$PWD" /src --bind "$PWD/.sandbox" /work --dev /dev --proc /proc \
  --setenv HOME /work --setenv TMPDIR /work --chdir /work \
  /bin/node --max-old-space-size=128 /src/__tests__/room-ref-bench.ts "$1" "$2"
