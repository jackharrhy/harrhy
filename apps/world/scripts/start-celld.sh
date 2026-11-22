#!/bin/sh
set -eu

node -e '
  const value = process.env.CELLD_VAR_HARRHY_WORLD_ORIGIN;
  const url = value && URL.parse(value);
  if (!url || !["http:", "https:"].includes(url.protocol) || url.origin !== value) {
    console.error("CELLD_VAR_HARRHY_WORLD_ORIGIN must be the exact browser-facing HTTP(S) origin");
    process.exit(1);
  }
'

# Allow a stale SQLite lease to expire after an unclean stop.
attempt=1
until celld diagnose --bucket "$CELLD_BUCKET" --no-control-plane; do
  [ "$attempt" -lt 30 ] || exit 1
  attempt=$((attempt + 1))
  sleep 1
done
celld deploy . --bucket "$CELLD_BUCKET"
exec celld --no-control-plane
