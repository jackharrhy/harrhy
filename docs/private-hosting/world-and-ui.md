# World and Harrhy UI hosting

These optional registrations start disabled. Use the existing Private Hosting daemon and control socket. Infra owns exact-host authentication, TLS and cutover.

## World

Follow the [World build and Celld contract](../../apps/world/README.md) on the selected revision. Use Node 26 and the pinned pnpm to install with `--frozen-lockfile` and build with `pnpm --filter @harrhy/world run build`. Verify the qualified binary with `node scripts/celld-runtime.mjs verify "$CELLD_BIN"`. Deploy `apps/world` into its own persistent SQLite bucket with `CELLD_VAR_HARRHY_WORLD_ORIGIN=https://world.pi.jackharrhy.dev` and the built app’s esbuild path in `CELLD_ESBUILD`. Node is needed to build, not to serve. Never reuse the hosting state database as the World bucket.

Example `apps.world` entry (replace paths and reserve the loopback port):

```json
{
  "host": "world.pi.jackharrhy.dev",
  "port": 3189,
  "argv": [
    "/srv/celld/bin/celld",
    "--bucket",
    "sqlite:///var/lib/world/objects.sqlite3",
    "--listen",
    "127.0.0.1:3189",
    "--no-control-plane"
  ],
  "cwd": "/srv/harrhy/apps/world",
  "env": { "CELLD_WATCH": "/var/lib/world/runtime" }
}
```

Keep the explicit Celld listener port equal to the registered port. One foreground Celld process serves the shell, assets, BSP, health and `/room` WebSocket from the private namespace. Caddy publishes it only after `/healthz` returns 200. Restarts do not restore in-memory matches.

Before cutover, use a disposable bucket to check the readiness map and revision, `/maps/hall.bsp`, and a real `/room` hello and reconnect on the exact browser origin. Run the app’s surface and live-pool checks described in its README. The daemon checks readiness status, not the payload or player session.

## Harrhy UI

Use the qualified nonroot image and its default command with `HOST=0.0.0.0` inside the container, `PORT=18943`, `NODE_ENV=production` and `UI_HOSTS=127.0.0.1,localhost,harrhy-ui.pi.jackharrhy.dev`. Give it no published host port, application mounts or secrets. Infra must provide a protected filesystem Unix relay from the daemon to the container's private listener. Provision a separate upstream socket directory, accessible only to the relay operator and the daemon UID. Do not give the daemon a Docker socket, a container lifecycle command or a public listener.

Example `apps.harrhy-ui` entry:

```json
{
  "host": "harrhy-ui.pi.jackharrhy.dev",
  "socket": "/run/harrhy-ui-upstream/http.sock"
}
```

The daemon probes `/healthz` through this socket using the exact configured `Host`; Caddy preserves that host to the origin. The daemon never starts, stops, or signals the image or relay. Verify health `200 ok`, a titled `200` home page, and `404` for both unknown hosts and `/sluggers-lab` before activation. The Unix relay and its permission boundary must be qualified separately from the image.
