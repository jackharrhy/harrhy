# World

World is a private multiplayer walk-through of the authored GoldSrc hall. Node serves a Remix 3 page and bridges same-origin game traffic to the local Celld Worker. `WorldRoomCell` owns player simulation. The browser uses Worldview’s WebGPU renderer, Gurgur’s directional sprites and a Wood HUD built with `@harrhy/ui`.

Right-drag to orbit your avatar (drag on touch), click or tap the floor to walk, and scroll all the way in for first person. Click to capture the mouse, use WASD, and hold Space to auto-bhop. Scroll out to return to third person. The west wall has a surf ramp. A WebGPU-capable browser is required.
Click either table to walk up and sit. Moss joins automatically at the west table; the east table is human-only. Right-drag orbits the shared Pool camera; middle-drag pans and the wheel zooms. Pull back and release to shoot, or use arrow keys and hold Space. A disconnected seat stays reserved for 30 seconds in the same tab. Leave the table to resume walking.

Click a chess table to sit. The west table is human-only; the east table automatically seats a random-move bot. Click a piece and then a highlighted square. Chess shares the same table camera and seat recovery as pool.

## Run locally

Install with Node 26 and `npm ci`. Build with `npm run build --workspace @harrhy/world`. Use the qualified [Celld runtime](../../docs/celld-runtime.md), an isolated SQLite bucket, and a loopback listener. For example, from the repository root:

```sh
scratch=$(mktemp -d)
bucket="sqlite://$scratch/objects.sqlite3"
export CELLD_ESBUILD="$PWD/node_modules/.bin/esbuild"
export CELLD_VAR_HARRHY_WORLD_ORIGIN=http://127.0.0.1:3189
"$CELLD_BIN" deploy apps/world/celld --bucket "$bucket"
"$CELLD_BIN" --bucket "$bucket" --listen 127.0.0.1:3188 --no-control-plane
```

In another terminal, start the frontend with `HARRHY_WORLD_ORIGIN=http://127.0.0.1:3189 HARRHY_WORLD_UPSTREAM=http://127.0.0.1:3188 npm start --workspace @harrhy/world` and open `http://127.0.0.1:3189/`. `HARRHY_WORLD_PORT` selects the frontend port; set `HARRHY_WORLD_ORIGIN` and Celld’s matching origin for a private HTTPS route. Exact Origin is not account authentication. Do not expose the Celld listener or its benchmark endpoint to browsers.

## Boundaries

- `server/index.ts` serves the page and browser bundle and relays World’s HTTP and WebSocket traffic. It has no game state.
- `celld/worker.ts` serves the deployed BSP and routes to `WorldRoomCell`. The cell steps bitECS at 60 Hz while occupied and emits player snapshots at 20 Hz. Pool broadcasts full ball poses at 60 Hz while a shot rolls. Player state is ephemeral; a restart does not restore players.
- `shared/motion.ts` runs `@harrhy/schmovement` in the cell and in the client. Both trace the same authored BSP; a revision check rejects mismatched joins. `app/bsp-render.ts` renders that same BSP.
- The editable map and bake instructions are in [Editing the Hall](content/README.md). Rebuild the map and redeploy the Worker together. The frontend build does not publish a separate map copy.

`npm run check --workspace @harrhy/world` checks types, simulation tests and both frontend bundles. With a disposable pair running, set `HARRHY_WORLD_TEST_BSP=1` and `HARRHY_WORLD_TEST_URL` for `npm run test:browser --workspace @harrhy/world`. `node apps/world/scripts/bench-room.mjs --help` describes the loopback-only room benchmark.
