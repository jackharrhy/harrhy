#!/bin/sh
set -eu

image=${1:-harrhy-world-hosting-smoke}
origin=http://127.0.0.1:44100
volume=$(docker volume create)
container=

cleanup() {
  status=$?
  if [ -n "$container" ]; then
    if [ "$status" -ne 0 ]; then docker logs "$container" || :; fi
    docker rm -f "$container" >/dev/null || :
  fi
  docker volume rm "$volume" >/dev/null || :
}
trap cleanup EXIT
trap 'exit 1' INT TERM

start() {
  container=$(docker run -d --network none \
    --mount "type=volume,source=$volume,target=/app/.celld" \
    -e "CELLD_VAR_HARRHY_WORLD_ORIGIN=$origin" "$image")
  attempt=1
  until docker exec "$container" node -e '
    fetch("http://127.0.0.1:44100/healthz", { signal: AbortSignal.timeout(1000) })
      .then(r => r.json())
      .then(health => { if (health.status !== "ready") process.exitCode = 1 })
      .catch(() => { process.exitCode = 1 });
  ' 2>/dev/null; do
    [ "$(docker inspect -f '{{.State.Running}}' "$container")" = true ] || return 1
    [ "$attempt" -lt 60 ] || return 1
    attempt=$((attempt + 1))
    sleep 1
  done
  docker exec "$container" sh -eu -c '[ "$(id -u)" -ne 0 ] && [ "$(cat /proc/1/comm)" = celld ]'
  docker exec -e "HARRHY_WORLD_TEST_URL=$origin" "$container" \
    node --test __tests__/frontend.test.mjs
}

start
database=/app/.celld/object-store/objects.sqlite3
inode=$(docker exec "$container" stat -c %i "$database")
docker stop "$container" >/dev/null
docker rm "$container" >/dev/null
container=
start
[ "$inode" = "$(docker exec "$container" stat -c %i "$database")" ]
docker stop "$container" >/dev/null
