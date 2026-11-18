# World

World is a private multiplayer walk-through of the Pool hall with the tables removed. Remix 3 serves the page, Three renders the hall and directional Gurgur sprites, and Bun runs an ephemeral authoritative room. There are no matches, chat, accounts, or saved positions.

Run `npm ci` with Node 26 and Bun 1.4.4, then `npm run dev --workspace @harrhy/world`. Open `http://127.0.0.1:3189/`. Right-drag to orbit your avatar (drag on touch); scroll to zoom in or out. Click or tap the floor to walk. The destination ring clears on arrival or if blocked. Scroll all the way in for first person; click to capture the mouse, use WASD, and hold Space to auto-bhop. Scroll out to return to third person. Arrow keys turn when the canvas has focus, and Escape releases the mouse. The compact HUD is built with `@harrhy/ui` and World’s scoped Wood theme. Append `?renderer=webgl` to use the Three WebGL fallback.

`HARRHY_WORLD_PORT` selects the loopback port. `HARRHY_WORLD_ORIGIN` must be the exact browser origin for socket admission. Host this only behind the private preview boundary; matching Origin is not account authentication. `/healthz` reports server readiness.

Movement uses ground friction, capped wish-direction air acceleration and steep-plane sliding. Try the practice ramp along the west wall. The World profile borrows feel from [Footbag](https://github.com/d-c02/footbag) and [J. W. Chong’s Half-Life movement notes](https://jwchong.com/hl/); the Worldview viewer retains its defaults.

## Boundaries

- `app/router.tsx` and `app/canvas.tsx` own the shell and canvas lifecycle. `app/render.ts` owns only presentation. `app/hall.ts` adapts the Pool room geometry; asset provenance is in `public/textures` and `public/billboard`.
- `shared/motion.ts` runs `@harrhy/schmovement`’s GoldSrc movement core on both sides. `shared/room.ts` holds bitECS player state; client entity identifiers are not ECS indices. Collision covers the hall envelope, bar, stools and the surf ramp, not decorative trim.
- `server/index.ts` owns admission, roster, simulation ticks and snapshots. The preview uses one same-origin WebSocket with separate roster and motion messages. It reuses Gurgur's motion/prediction principles, not its WebRTC transport. Rejoining assigns a new ephemeral identity.

`npm run check --workspace @harrhy/world` typechecks, tests authoritative motion and builds both bundles. With the built app running on loopback, `npm run test:browser --workspace @harrhy/world` drives two Chromium clients and checks desktop click and simulated mobile tap movement, FPS mode, departure and rejoin. Set `HARRHY_WORLD_TEST_URL` for a different disposable instance.

To compare WebSocket room performance, run `node apps/world/scripts/bench-room.mjs --help` from the repository root. The benchmark uses the same Node clients against already-running, empty loopback rooms serving the same map revision. It does not start either runtime.

For the authored hall use `HARRHY_WORLD_MAP=bsp npm run dev --workspace @harrhy/world`. This mode requires WebGPU and serves the same BSP bytes it uses for collision. See [Editing the Hall](content/README.md). The default legacy room retains the Three renderer.

## Celld room experiment

`celld/worker.ts` hosts the same room simulation inside a World-specific `WorldRoomCell` Durable Object. The experiment serves the BSP, health and game socket; it is not a replacement browser deployment. Player state is still ephemeral. No brush editing or MapCell dependency is involved. Use the qualified binary from `celld.json`, a disposable SQLite bucket and a loopback listener. From the repository root, with a built World app and a verified Celld binary:

```sh
scratch=$(mktemp -d)
bucket="sqlite://$scratch/objects.sqlite3"
export CELLD_ESBUILD="$PWD/node_modules/.bin/esbuild"
"$CELLD_BIN" deploy apps/world/celld --bucket "$bucket"
"$CELLD_BIN" --bucket "$bucket" --listen 127.0.0.1:21896 --no-control-plane
# In a separate terminal, start the existing World app in BSP mode on 21895.
node apps/world/scripts/bench-room.mjs --bun-url http://127.0.0.1:21895 --celld-url http://127.0.0.1:21896 --seconds 5
```

One local run with the same hall revision, 60 input slots per player per second and 1, 6, then 12 players measured p95 exact-sequence acknowledgements of 16.3/17.4/17.4 ms on Bun and 16.8/14.7/17.5 ms on Celld. The p95 snapshot gaps were 48.5–49.3 ms and 51.0–51.7 ms respectively. Bun’s `setInterval` averaged 62.1 Hz here while Celld’s deadline scheduler held 60 Hz; this is an implementation comparison, not an isolated runtime overhead measurement. All final acknowledgement watermarks arrived, but snapshots expose only about one in three exact sequences. These short loopback runs do not establish WAN, slow-client, multi-room or recovery behavior.
