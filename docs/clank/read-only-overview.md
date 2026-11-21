# Clank read-only allocation

Use the **same** compiled Remix document, `/sessions.js`, ClankProvider and Cap’n Web `SessionApi` as the synthetic fixture. In read-only mode the UI opens on Overview; the list remains available without commands. SessionCell rejects create/rename/archive **before** forwarding, regardless of client props or RPC arguments. There is no SSE endpoint or alternative browser bundle.

## Infra contract

- Pin the app and source to the same reviewed SHA. Build with `pnpm install --frozen-lockfile`, `node apps/pi/harrhy/install.mjs` (first install of Pi's isolated dependencies) and `pnpm --filter @harrhy/clank build`. Stage **only** `apps/clank/.celld/standalone/{worker.mjs,wrangler.jsonc}` in a new generation directory. Use the checksum-qualified native [Celld](../celld-runtime.md); bind the app privately, never to a wildcard.
- Required Worker **and SessionCell** startup bindings: `HARRHY_CLANK_MODE=read-only`; `HARRHY_CLANK_PUBLIC_ORIGIN` = exact canonical HTTPS origin **without trailing slash** (literal `http://127.0.0.1:<port>` for isolated local tests); `HARRHY_CLANK_SOURCE_PORT` = numeric private loopback source port, not 18149; `HARRHY_CLANK_VIEW_PASSWORD` = generation-specific private Basic password; `HARRHY_CLANK_BRIDGE_TOKEN` = separate 32 random bytes in lowercase hex. Change mode/credentials only by replacing that generation. An invalid mode, omitted read-only origin/port, or a custom origin with omitted mode fails closed.
- **Edge → app:** generation-specific private socket/relay and route lifetime are owned by Infra/Go, not Clank. Strip caller-supplied Authorization and forwarded identity headers. Authorize the intended viewer, then inject `Authorization: Basic base64(clank:<VIEW_PASSWORD>)` on every admitted request, including upgrades. This is a private edge credential; do not deliver it to the browser. Preserve the configured public **Host/authority** (including any non-default port); read-only mode compares it to the request URL authority, not the private HTTP scheme. No X-Forwarded-* trust. Preserve the browser's actual Origin; never manufacture an allowed Origin for a caller.
- Allow exactly **GET /** (HTML), **GET /sessions.js** and **GET /live** (WebSocket upgrade with exact `Origin: <PUBLIC_ORIGIN>`). No query strings. Wrong host/path/method: 404; missing/wrong Basic on these paths: 401; wrong or absent WS Origin: 403; non-upgrade /live with valid Origin: 426. No forwarding to a Pi sign-in, /chord, /rpc or any other destination. A bridge token, Pi cookie or SSH reachability is not viewer authorization. Revocation must close established edge WS streams, not just refuse new requests.
- **App → source:** SessionCell dials `ws://127.0.0.1:<SOURCE_PORT>/rpc` in the same private network namespace, no Origin, subprotocol `clank.<BRIDGE_TOKEN>`. Only that source process may own the destination port during the allocation. Source pushes a seq-zero snapshot in a fresh epoch, then acknowledged keyed changes. It exposes **no** command target. Never publish this listener or route it through the edge.
- Keep fixture mode on its existing listener. With mode, public origin and source port all unset, it retains `http://127.0.0.1:18148`, the synthetic write bridge on 18149 and the original create/rename/archive behavior. Never install that bridge in Newport Pi.

## Owner Chord source (operator only)

`apps/clank/read-only/source.ts` runs **out of process**. From the verified local Pi listener it acquires only owner `Sessions`, its binding and `sessions` watch over `/chord?client=script`. It calls no session method, reads no Pi database or transcript and loads no Pi facet. Pi has no narrower owner-catalog credential: this **trusted process holds an owner-capable bearer cookie**, not a read-only Pi identity. It receives full catalog rows and projects only active ID/title/creation time/main and branch conversation/label/optional parent. These are private too. No cwd, model, archived rows or history crosses into the app.

For a separately authorized live activation, choose and verify the actual Pi port and directory plus two unused loopback ports (app, source). The source must share loopback with Pi and SessionCell. Never attach a synthetic test or the mutable fixture to the live host. Example provisioning in bash **from the reviewed repo root**, inside the allocation supervisor:

```bash
set -eu
root=$PWD
: "${PI_PORT:?verified owner Pi port}" "${PI_DATA_DIR:?verified directory for one-shot sign-in}"
: "${SOURCE_PORT:?unused private source port}" "${APP_PORT:?unused private Celld port}"
: "${PUBLIC_ORIGIN:?exact owner-authorized allocation origin}"
pi=$PI_PORT; pi_data=$PI_DATA_DIR
ss -lntp "sport = :$pi"  # verify the intended process, don't probe with credentials
umask 077
creds=$(mktemp -d "${XDG_RUNTIME_DIR:?}/clank-generation.XXXXXX")
openssl rand -hex 32 > "$creds/bridge-token"
openssl rand -hex 32 > "$creds/view-password"
# Trusted one-shot helper reads the owner key and performs Pi challenge/claim.
node --input-type=module - "$pi" "$pi_data" "$creds" <<'JS'
import { writeFile } from 'node:fs/promises';
import { localOwnerSignIn } from './apps/pi/src/runtime/local-owner.ts';
const [port,data,dir]=process.argv.slice(2);
const result=await localOwnerSignIn(new URL(`http://127.0.0.1:${Number(port)}`),data);
if(result.kind!=='signed-in')throw Error('Local owner sign-in refused');
await writeFile(`${dir}/pi-cookie`,result.cookie,{mode:0o600,flag:'wx'});
JS
# Only the source receives pi-cookie. Stage the worker without the source credentials.
mkdir "$creds/app"
cp apps/clank/.celld/standalone/{worker.mjs,wrangler.jsonc} "$creds/app/"
printf 'HARRHY_CLANK_MODE=read-only
HARRHY_CLANK_PUBLIC_ORIGIN=%s
HARRHY_CLANK_SOURCE_PORT=%s
HARRHY_CLANK_VIEW_PASSWORD=%s
HARRHY_CLANK_BRIDGE_TOKEN=%s
'   "$PUBLIC_ORIGIN" "$SOURCE_PORT" "$(cat "$creds/view-password")" "$(cat "$creds/bridge-token")" > "$creds/app/.dev.vars"
node scripts/celld-runtime.mjs verify "${CELLD_BIN:?qualified binary}"
# Launch as separate supervised children. Supply the edge only view-password via private file.
node --import ./apps/pi/src/source-resolver.ts apps/clank/read-only/source.ts "$pi" "$SOURCE_PORT" "$creds" &
CELLD_ESBUILD="$root/apps/clank/node_modules/.bin/esbuild" "$CELLD_BIN" dev "$creds/app" --host 127.0.0.1 --port "$APP_PORT" --no-watch &
```

Confirm the source listener belongs to the intended process before handing the app to the edge. Limit the allocation to at most one hour (source enforces one hour or remaining cookie lifetime). One owner watch; up to eight readers, one delivery per reader in flight and an eight-second acknowledgement deadline. Limits: 256 active rows, 128 branches per row, 192 KiB projected, 4 MiB upstream WS message. Oversize or lost owner binding shuts down the source; it never retries an owner credential against a restarted Pi port. A browser reconnect accepts a fresh authoritative epoch, not stale rows. Do not log credentials, titles or snapshots.

**Teardown:** withdraw the generation from the authenticated edge, close its WS streams and remove its socket; stop that Celld process, then that source process. On premature source exit withdraw the app too, before another service can bind its port. Confirm both listeners are gone and remove the generation directory, credentials and Celld state. Don't rotate Pi keys, sign out other devices, stop any existing fixture, or reuse an old generation's password. Closing one local Pi login doesn't revoke all its already-open links; stopping the source is the immediate cutoff.

## Disposable verification

With dependencies and browser bundle built, run `node --import ../pi/src/source.ts __tests__/read-only.mjs` in `apps/clank` in an isolated loopback namespace (ports 19883–19885), with `CELLD_BIN` set to the qualified executable and `CHROMIUM_BIN` if needed. It starts its own fake Pi, uses a legitimate guest and owner login, and tests the actual source, Worker, SessionCell and browser RPCs. No live endpoint/credential is input. Host/Origin preservation is checked over private HTTP; this does not exercise the separate Go edge, its auth or its allocation socket.
