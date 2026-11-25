#!/bin/sh
set -eu
case "$(id -un)" in owner|marty) ;; *) exit 1;; esac
printf "%s\n" "$$" > "$HOME/session.pid"
printf "FIXTURE_READY\n"
while IFS= read -r operation; do
 case "$operation" in
 edit) printf "<h1>SSH fixture edit</h1>\n" >/workspace/checkout/index.html; printf "EDIT_OK\n";;
 ping) printf "FIXTURE_PONG\n";;
 *) exit 1;;
 esac
done
