# World

World is a private multiplayer walk-through of the authored GoldSrc hall. One Celld process serves the Remix 3 page, native static assets and same-origin game traffic. `WorldRoomCell` owns player simulation. The browser uses Worldview’s WebGPU renderer, Gurgur’s directional sprites and a Wood HUD built with `@harrhy/ui`.

Right-drag to orbit your avatar (drag on touch), click or tap the floor to walk, and scroll all the way in for first person. Click to capture the mouse, use WASD, and hold Space to auto-bhop. Scroll out to return to third person. The west wall has a surf ramp. A WebGPU-capable browser is required.
Click either table to walk up and sit. Moss joins automatically at the west table; the east table is human-only. Right-drag orbits the shared Pool camera; middle-drag pans and the wheel zooms. Pull back and release to shoot, or use arrow keys and hold Space. A disconnected seat stays reserved for 30 seconds in the same tab. Leave the table to resume walking.

Click a chess table to sit. The west table is human-only; the east table automatically seats a random-move bot. Click a piece and then a highlighted square. Chess shares the same table camera and seat recovery as pool.

## Run locally

Install with Node 26 and `pnpm install --frozen-lockfile`. Set `CELLD_BIN` to the absolute path of the [qualified binary](../../docs/celld-runtime.md). From the repository root, using an unused loopback port:

```sh
node scripts/celld-runtime.mjs verify "$CELLD_BIN"
pnpm --filter @harrhy/world run build
scratch=$(mktemp -d)
bucket="sqlite://$scratch/objects.sqlite3"
export CELLD_ESBUILD="$PWD/apps/world/node_modules/.bin/esbuild"
export CELLD_VAR_HARRHY_WORLD_ORIGIN=http://127.0.0.1:3189
"$CELLD_BIN" deploy apps/world --bucket "$bucket"
"$CELLD_BIN" --bucket "$bucket" --listen 127.0.0.1:3189 --no-control-plane
```

Open `http://127.0.0.1:3189/` directly. `HARRHY_WORLD_ORIGIN` in the Worker must be the exact browser-facing HTTP(S) origin, including a non-default port and no trailing slash. It controls WebSocket admission and the shell's CSP. Origin checking is not account authentication. Keep the listener private. Node and `ws` are not production services.

## Boundaries

- `celld/worker.ts` serves `/` through `app/router.tsx`. Static files come from the native `ASSETS` binding over `dist/client`; the Worker serves `/maps/hall.bsp` and `/healthz` from the same deployed map. Only `/room` routes to `WorldRoomCell`.
- The cell steps bitECS at 60 Hz while occupied and emits player snapshots at 20 Hz. Pool broadcasts full ball poses at 60 Hz while a shot rolls. Player state is ephemeral; a restart does not restore players.
- `shared/motion.ts` runs `@harrhy/schmovement` in the cell and in the client. Both trace the same authored BSP; a revision check rejects mismatched joins. `app/bsp-render.ts` renders that same BSP.
- The editable map and bake instructions are in [Editing the Hall](content/README.md). Rebuild the map and redeploy the Worker together. The frontend build does not publish a separate map copy.

## Verification

`pnpm --filter @harrhy/world run check` checks types, simulation tests and the browser build. With the **disposable** listener above still running, run these sequentially from another terminal:

```sh
export HARRHY_WORLD_TEST_URL=http://127.0.0.1:3189
pnpm --filter @harrhy/world run test:surface
pnpm --filter @harrhy/world run test:pool-live
HARRHY_WORLD_TEST_BSP=1 pnpm --filter @harrhy/world run test:browser
```

The browser smoke needs Playwright Chromium with WebGPU (SwiftShader is supported). `node apps/world/scripts/bench-room.mjs --help` describes the separate loopback-only WebSocket benchmark; the Worker publishes no benchmark endpoint.
