#!/usr/bin/env bash
set -euo pipefail

content=$(cd -- "$(dirname -- "$0")" && pwd)
tools=${HARRHY_WORLD_ERICW_TOOLS:-"$HOME/.local/lib/ericw-tools/2.0.0-alpha11"}
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
cp -- "$content/hall.map" "$work/hall.map"

compile() {
  local tool=$1
  shift
  if ! "$tools/$tool" "$@" >"$work/$tool.out" 2>&1; then
    cat "$work/$tool.out" >&2
    exit 1
  fi
}

compile qbsp -threads 1 -hlbsp -leaktest -wadpath "$content" "$work/hall.map"
if [[ ! -s "$work/hall.prt" || -e "$work/hall.pts" || -e "$work/hall.lin" ]]; then
  echo 'Hall did not pass sealing checks.' >&2
  exit 1
fi
compile vis -threads 1 "$work/hall.bsp"
compile light -threads 1 -extra "$work/hall.bsp"
compile bspinfo "$work/hall.bsp"
grep -q 'BSP is version Half-Life BSP' "$work/bspinfo.out"
grep -Eq 'lightdata[[:space:]]+[1-9][0-9]*$' "$work/bspinfo.out"
grep -Eq 'visdata[[:space:]]+[1-9][0-9]*$' "$work/bspinfo.out"
cp -- "$work/hall.bsp" "$content/hall.bsp"
printf '%s\n' 'Built sealed GoldSrc BSP30 with visibility and RGB lighting: hall.bsp'
