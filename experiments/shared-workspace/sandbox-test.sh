#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
node_bin=$(realpath "${NODE_BIN:-$(command -v node)}")
[[ -x "$node_bin" ]]
mkdir -p .sandbox
deps=()
for dep in capnweb ws; do
  deps+=(--ro-bind "$(realpath "node_modules/$dep")" "/src/node_modules/$dep")
done
ulimit -t 20 -f 32768
proxy=()
if [[ -n "${TOXIPROXY_BIN:-}" ]]; then
  proxy=(--ro-bind "$(realpath "$TOXIPROXY_BIN")" /bin/toxiproxy-server --setenv HARRHY_CLANK_TOXIPROXY 1)
fi
exec timeout -k 2s 30s bwrap --unshare-net --unshare-pid --die-with-parent --new-session --clearenv \
  --ro-bind /usr/lib /usr/lib --symlink usr/lib /lib --symlink usr/lib/x86_64-linux-gnu /lib64 \
  --ro-bind "$node_bin" /bin/node --ro-bind "$PWD" /src --tmpfs /src/node_modules --bind "$PWD/.sandbox" /work \
  "${proxy[@]}" "${deps[@]}" --dev /dev --proc /proc --setenv HOME /work --setenv TMPDIR /work --setenv UV_THREADPOOL_SIZE 2 \
  --chdir /work /bin/node --max-old-space-size=128 --test /src/__tests__/wire.test.ts /src/__tests__/lease.test.ts /src/__tests__/room-ref.test.ts /src/__tests__/suggestion.test.ts
