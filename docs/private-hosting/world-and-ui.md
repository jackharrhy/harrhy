# World and Harrhy UI hosting

These optional registrations start disabled. Use the existing Private Hosting service and control socket; do not install separate systemd units for World's web and authority processes. Infra owns exact-host authentication, TLS, and the cutover window.

## World

Follow the [World build and Celld deployment contract](../../apps/world/README.md) at the selected revision. Use Node 26 and the repository's pinned pnpm, `pnpm install --frozen-lockfile`, and `pnpm --filter @harrhy/world run build`. Verify the selected Celld binary with `node scripts/celld-runtime.mjs verify "$CELLD_BIN"`. Deploy the Worker from the same revision into a dedicated persistent SQLite bucket before starting the pair. Use `CELLD_VAR_HARRHY_WORLD_ORIGIN=https://world.pi.jackharrhy.dev` for the deploy and the exact same origin for the frontend. Never use the hosting state database for the World bucket.

Example `apps.world` registry entry (replace paths and reserve both ports):

```json
{
  "host": "world.pi.jackharrhy.dev",
  "port": 3189,
  "argv": ["/usr/bin/node", "dist/server/index.js"],
  "cwd": "/srv/harrhy/apps/world",
  "env": {
    "HARRHY_WORLD_PORT": "3189",
    "HARRHY_WORLD_ORIGIN": "https://world.pi.jackharrhy.dev",
    "HARRHY_WORLD_UPSTREAM": "http://127.0.0.1:3188"
  },
  "companion": {
    "port": 3188,
    "argv": [
      "/srv/celld/bin/celld",
      "--bucket",
      "sqlite:///var/lib/world/objects.sqlite3",
      "--listen",
      "127.0.0.1:3188",
      "--no-control-plane"
    ],
    "cwd": "/srv/harrhy/apps/world"
  }
}
```

The daemon launches the authority first and then Node, with distinct loopback ports in the existing private namespace. Both processes must answer `GET /healthz` with 200 before Caddy publishes the Node route. The authority has no Caddy route. An exit withdraws the route and restarts the pair; stop withdraws before signalling either process. Restarts do not restore in-memory matches.

Before cutover, qualify a disposable bucket and check that `/healthz` reports ready with the expected map and revision, `/maps/hall.bsp` serves the matching map, and `/room` carries a real WebSocket hello and reconnect through Node and the protected gateway. The daemon checks readiness status, not the contents of the payload or the browser session.

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
