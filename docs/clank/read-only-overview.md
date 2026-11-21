# Owner-only session map over SSH

`apps/clank/read-only/server.ts` is a separate Node process. It never runs inside Pi, starts a worker, opens a Pi database, or loads Clank's fixture bridge, SessionCell or command API. It makes one authenticated WebSocket connection to `127.0.0.1:PI_PORT/chord?client=script` and acquires only `Sessions` (owner variant), watching its binding and `sessions` member. No session methods are called.

**The viewer is read-only; the upstream credential is not.** Pi's owner `Sessions` is not a catalog-only credential; guest variants cover only shared sessions and are refused. The connector is trusted with an owner bearer cookie and the session catalog, including fields it discards. Don't install it as a generic proxy or give the cookie to a browser, agent, forwarded client or fixture. Trust the local host and confirm the Pi listener/process before supplying a credential. Loopback alone does not authenticate either party.

The viewer accepts only authenticated GET requests for `/`, `/client.js` and `/catalog` (server-sent events). It requires the exact loopback Host, rejects foreign Origins and cross-site fetches, and has no WebSocket endpoint. Only active session ID/title/creation time/main and branch conversation/label/optional parent leave the connector. No cwd, model, history, messages, tools, or archive. Titles and labels are private too. Latest snapshots remain in memory; a disconnected browser clears its graph and receives a current snapshot on reconnect. A lost/non-owner upstream binding closes the listener and requires a deliberate new launch; it never reuses the Pi credential against a restarted port. Closing one local Pi login does **not** revoke all its already-open links: stop the connector to withdraw this preview immediately.

Limits: eight readers, 256 active sessions, 128 branches per session, 192 KiB projected snapshot, 4 MiB upstream WS message, eight seconds to bind. Oversized input fails closed rather than showing a partial map. A backed-up reader is disconnected on the next changed snapshot. Whole bounded snapshots, not an event log. Review lease: at most one hour or the cookie's remaining lifetime, whichever is shorter.

## Enable (operator only, after explicit live activation approval)

Use a separate unused port on the existing Voxl/SSH loopback path. **Do not** stop/reconfigure the fixture, reload Pi, change ingress, register a preview lease, use SSH `-g`, or expose a non-loopback address. From the reviewed worktree on Newport in **bash**:

```bash
set -eu
root=$PWD
pnpm install --frozen-lockfile
# Once per clean worktree, install Pi's isolated pinned source dependencies.
node apps/pi/harrhy/install.mjs
pnpm --filter @harrhy/clank build
read -rp 'Verified loopback Pi port: ' pi
read -rp 'Verified absolute Pi data directory (sign-in helper only): ' pi_data
view=19883
ss -lntp "sport = :$pi"      # verify LISTEN belongs to the intended Pi
if ss -H -lnt "sport = :$view" | grep -q .; then echo 'Choose an unused view port'; exit 1; fi
umask 077
creds=$(mktemp -d "${XDG_RUNTIME_DIR:?}/clank-read-only.XXXXXX")
trap 'rm -f -- "$creds/pi-cookie" "$creds/view-password"; rmdir -- "$creds"' EXIT
openssl rand -hex 32 > "$creds/view-password"
# Trusted one-shot Pi sign-in, outside the connector. Only the cookie pair goes
# into the private file. No owner key leaves the sign-in helper. No token on stdout.
node --input-type=module - "$pi" "$pi_data" "$creds" <<'JS'
import { writeFile } from 'node:fs/promises';
import { localOwnerSignIn } from './apps/pi/src/runtime/local-owner.ts';
const [port,data,dir]=process.argv.slice(2);
const result=await localOwnerSignIn(new URL(`http://127.0.0.1:${Number(port)}`),data);
if(result.kind!=='signed-in')throw Error('Local owner sign-in refused');
await writeFile(`${dir}/pi-cookie`,result.cookie,{mode:0o600,flag:'wx'});
JS
# Supply ONLY the viewer password to Jack through his private password channel.
printf 'Viewer password file (not the Pi cookie): %s/view-password\n' "$creds"
node_bin=$(node -p process.execPath)
cd "$root/apps/clank"
env -i PATH="$(dirname "$node_bin"):/usr/bin:/bin" "$node_bin" \
  --import ../pi/src/source-resolver.ts read-only/server.ts "$pi" "$view" "$creds"
```

Keep that foreground terminal open. On Jack's side use the existing **private SSH local forward** for the chosen port, or equivalent in Voxl: local `127.0.0.1:19883` → Newport `127.0.0.1:19883`. Use the same local/remote port and literal address (exact Host admission). In an isolated browser profile open `http://127.0.0.1:19883/`, Basic user `clank` with the **viewer** password. An unauthenticated GET must return 401. Avoid a browser profile containing Pi cookies (cookies are not isolated by port). Don't print/share catalog output as a health check. If the upstream bind fails, check identity, contract version, expiry and bounds; don't switch to the fixture bridge.

## Disable

Close the isolated tab/profile and remove **only this** SSH forward. Interrupt the foreground connector (Ctrl-C); let the bash block exit so the `EXIT` trap removes the two private files and directory. If a shell was killed instead, remove those two files from its specific temporary directory. Confirm `ss -H -lnt 'sport = :19883'` is empty before port reuse. This does not revoke other Pi sessions, change Pi state or restart services. A new review should use a fresh viewer password and a newly verified upstream listener.

## Disposable qualification

With the same dependencies and client build, execute `node --import ../pi/src/source.ts __tests__/read-only.mjs` from `apps/clank` in an isolated loopback namespace with a private writable temp dir and Chromium (`CHROMIUM_BIN` if not installed in the test profile). It starts a fresh fake Pi, independently seeds catalog data and a valid view guest, and spawns the real connector. It exercises guest denial, HTTP write denial, projection, Chromium live update, disconnect/clear/fresh reconnect and owner-link revocation. No endpoint or credential of an existing Pi is supplied. HTTP and Chord access are tested, not WAN capacity or Voxl UI automation.
