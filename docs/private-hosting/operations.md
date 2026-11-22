# Private Hosting: Infra run contract

Private Hosting serves operator-registered `atlas` and `go-demo` apps and supports optional World, Harrhy UI and Slides registrations. It does not read or migrate Clank state, manage DNS, issue certificates, authenticate users, or accept arbitrary commands or artifacts from clients.

## Provisioning

- Use Linux, Rust 1.93+ with a C toolchain (bundled SQLite) and a dedicated Caddy executable supporting Unix listener permissions and `admin.config.persist: false` (smoke-tested with Caddy 2.10.2). Do not share this Caddy instance with any other service or use `--resume`. Build the daemon with `cargo build --release --locked --manifest-path apps/private-hosting/Cargo.toml`. Build the demo with Go 1.22+: `go build -o /absolute/bin/hosting-demo ./apps/private-hosting/demo/main.go`.
- Run under a dedicated unprivileged service UID. Run the daemon, Caddy and both origins in one systemd service cgroup, with `KillMode=mixed` (SIGTERM to the daemon first, group SIGKILL on timeout/failure), `SendSIGKILL=yes`, `TimeoutStopSec=15s`, and `Restart=on-failure`. The unit must finish cleaning up old children before starting a new daemon. Do not launch the backends separately or let them daemonize, escape their process groups, or bind outside loopback.
- Use `PrivateNetwork=yes` or equivalent isolation so unrelated host processes cannot reach the backend loopback ports and bypass gateway authorization. Filesystem Unix sockets remain usable across network namespaces. For host-loopback Slides adoption, Caddy must reach that same loopback namespace; a separate private namespace alone will not work. Infra must verify an equivalent local-access control before enabling the route without restarting Slides. This pilot assumes offline Atlas serving; do not enable integrations that need egress without reviewing the network boundary.
- Provision one persistent local state directory (0700) and one volatile run directory (0700), both owned by the daemon UID. The run directory should be short enough for Linux Unix socket limits. A separate dedicated ingress directory must be owned by that UID, with its group set to a gateway-only group and the directory mode set to 2750 so the gateway can traverse and the socket inherits the group. The daemon exclusively owns the configured socket pathname and removes stale sockets; do not use it for anything else. The ingress socket is 0660. Admin and control sockets are never shared with the gateway.
- Infra terminates HTTPS and authorizes the intended audience **for each exact hostname** before connecting to the ingress socket. Preserve the authorized external `Host`, reject unregistered hosts, and do not relay a user-supplied substitute Host or accept direct backend connections. Caddy's host match is routing, not authorization. Keep provider credentials at the gateway; Caddy and the daemon require none. Configure the gateway to reconnect to the Unix socket after replacement and avoid caching private responses.

## Registry and invocation

See [World and Harrhy UI](world-and-ui.md) for the optional paired runtime and private Unix-socket adoption contracts.

Provision an operator-owned immutable JSON registry outside the checkout. For example (fictional paths and hosts):

```json
{
  "caddy": "/usr/bin/caddy",
  "ingress": "/run/private-hosting-ingress/http.sock",
  "apps": {
    "atlas": {
      "host": "atlas.example.test",
      "port": 14101,
      "argv": ["/usr/bin/node", "--import", "remix/node-tsx", "server.ts"],
      "cwd": "/srv/harrhy/apps/atlas",
      "env": {
        "HARRHY_ATLAS_CONTENT_ROOT": "/srv/atlas/content",
        "HARRHY_ATLAS_MANIFEST": "/etc/atlas/spaces.json"
      }
    },
    "go-demo": {
      "host": "go-demo.example.test",
      "port": 14102,
      "argv": ["/srv/private-hosting/bin/hosting-demo"],
      "cwd": "/srv/private-hosting",
      "env": {}
    }
  }
}
```

To adopt an existing Slides server, add `"slides": {"host": "slides.example.test", "port": 21394}` under `apps`. Only this fixed loopback port is accepted, with no launch fields. The daemon probes `GET /` for HTTP 200. Slides defaults enabled on first registration; explicit stop persists and only withdraws the route. The daemon never launches or signals the Slides process.

Use an absolute Node 26.13+ executable and installed Atlas workspace dependencies; keep its content and manifest external. `argv` is executed directly with no shell; the child receives a minimal PATH, registered `env`, and daemon-assigned `PORT`. Both hosts and backend ports must be distinct. Reserve ports for this unit alone; the daemon checks for an occupied port before launch but does not transfer a pre-bound descriptor to Atlas. Do not run competing port binders in the namespace. Registry changes require a managed daemon restart. Both apps must serve `GET /healthz` with 200 only when ready.

For an existing Atlas installation, translate the preserved unit’s working directory and relative entry point together; omit Node `--watch` so this daemon owns restarts. Retain the external content and manifest paths and, if needed, the existing `HARRHY_ATLAS_WIDGETS` and `HARRHY_ATLAS_COMMENTS` paths. Check access with the target service UID before cutover. Keep credentials and contents out of the registry handoff; supply only private operator-managed paths.

```sh
/srv/private-hosting/bin/private-hosting --runtime /run/private-hosting run \
  --state /var/lib/private-hosting --config /etc/private-hosting/registry.json
```

Use the same executable and `--runtime` as the service UID to run `status`, `start atlas`, `stop atlas`, `start go-demo`, `stop go-demo`, or `start slides` and `stop slides` if registered. The JSON response distinguishes desired (`enabled`), child tracked (`running`), and Caddy-confirmed (`published`); `ingress_ready` indicates Caddy acknowledged a route generation, not that the external gateway is reachable. `start` accepts desired state; wait for `published` before testing the gateway. `stop` returns after route/connection withdrawal and child exit, or fails if the operation cannot complete. Independently check `ingress_ready` for recovery of other routes.

## Lifecycle and recovery

`hosting.sqlite3` is the only durable desired-state authority. A new database enables Atlas. An explicit Atlas stop persists over restarts. Go starts disabled on every daemon boot regardless of its former state. An enabled app is retried after unexpected exit or prolonged failed readiness; readiness loss withdraws its route immediately upon a failed probe. A stopped hostname returns 404 once the proxy recovers, as does any unknown host. Nothing is published before an app becomes ready.

The daemon runs Caddy from an empty bootstrap with configuration persistence disabled. It sends derived generations to `/load` over the private Unix admin socket without restarting Caddy on successful withdrawal. Once Caddy acknowledges removal, the daemon stops only the withdrawn managed origin, closing its active streams. A failed or ambiguous publication still closes ingress rather than trusting a stale route. On normal shutdown, ingress closes before backends and Atlas intent is unchanged. After a hard daemon kill, rely on systemd cgroup cleanup before restart; do not recover using stored PIDs.

Caddy 2.10.2 reloads all handlers even when only one route changes. A 30-second `stream_close_delay` keeps unrelated upgraded streams open at reload, but old-generation WebSockets may close when that delay expires. Ordinary unrelated HTTP streams can continue. For adopted apps, stop denies new requests but does not signal the external origin: existing upgraded connections can drain within the Caddy close delay, and ordinary streaming responses may continue until the origin or client ends them.

## Acceptance before any cutover

Use synthetic state and content first. Confirm gateway authorization for each exact host and a negative test for unknown/mismatched hosts, rejection of direct backend/admin access from outside the unit, socket permissions after replacement, and managed cleanup after daemon SIGKILL. Verify persistent Atlas stop and Go's boot-off policy. The application smoke exercises real Caddy and Go with synthetic Atlas, paired World processes, and a Unix-socket UI origin; it does not validate the Infra gateway, unit, or actual Atlas installation.
