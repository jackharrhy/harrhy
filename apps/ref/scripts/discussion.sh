#!/usr/bin/env bash
# Disposable loopback-only Celld + disposable issuer. Never imports local .dev.vars.
set -euo pipefail
cd "$(dirname "$0")/../../.."
root=$PWD
mode=${1:-on}
case "$mode" in on|off);; *) echo "usage: discussion.sh [on|off]" >&2; exit 2;; esac
binary=$(realpath "${CELLD_BIN:?set CELLD_BIN to the qualified native executable}")
node scripts/celld-runtime.mjs verify "$binary"
nodebin=$(node -p process.execPath)
mkdir -p .ref-discussion
state=$(mktemp -d "$root/.ref-discussion/run.XXXXXX")
app=$state/ref
mkdir -p "$app" "$state/tmp" "$state/home"
auth= runtime=
cleanup() {
  if [[ -n $runtime ]]; then kill "$runtime" 2>/dev/null || true; fi
  if [[ -n $auth ]]; then kill "$auth" 2>/dev/null || true; fi
  wait || true
  rm -rf -- "$state"
}
trap cleanup EXIT
trap "exit 130" INT TERM
cp -R apps/ref/{app,worker.ts,dist,package.json,tsconfig.json} "$app/"
cp apps/ref/.dev.vars.example "$app/.dev.vars"
if [[ $mode == on ]]; then
  cp apps/ref/__tests__/fixtures/live-board.jsonc "$app/wrangler.jsonc"
  echo HARRHY_REF_LIVE_BOARD=1 >> "$app/.dev.vars"
else
  cp apps/ref/wrangler.jsonc "$app/wrangler.jsonc"
fi
clean=(env -i PATH="$(dirname "$nodebin"):$PATH" HOME="$state/home" TMPDIR="$state/tmp")
"${clean[@]}" "$nodebin" packages/dev-auth/server.mjs & auth=$!
"${clean[@]}" CELLD_ESBUILD="$root/node_modules/.bin/esbuild" "$binary" dev "$app" --host 127.0.0.1 --port 8787 --no-watch & runtime=$!
wait -n "$auth" "$runtime"
