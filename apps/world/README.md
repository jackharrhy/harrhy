# World

World is a private multiplayer walk-through of the Pool hall with the tables removed. Remix 3 serves the page, Three renders the hall and directional Gurgur sprites, and Bun runs an ephemeral authoritative room. There are no matches, chat, accounts, or saved positions.

Run `npm ci` with Node 26 and Bun 1.4.4, then `npm run dev --workspace @harrhy/world`. Open `http://127.0.0.1:3189/`. Right-drag to orbit your avatar (drag on touch). Click or tap the floor to walk. The destination ring clears on arrival or if blocked. Switch on FPS mode for pointer lock, WASD and Space to jump. Arrow keys turn when the canvas has focus, and Escape releases the mouse. The compact HUD is built with `@harrhy/ui` and World’s scoped Wood theme. Append `?renderer=webgl` to use the Three WebGL fallback.

`HARRHY_WORLD_PORT` selects the loopback port. `HARRHY_WORLD_ORIGIN` must be the exact browser origin for socket admission. Host this only behind the private preview boundary; matching Origin is not account authentication. `/healthz` reports server readiness. Use a distinct origin from other apps: the preview's CSP allows `unsafe-eval` for Box3D's generated JS bindings. Don't serve user-authored content there.

## Boundaries

- `app/router.tsx` and `app/canvas.tsx` own the shell and canvas lifecycle. `app/render.ts` owns only presentation. `app/hall.ts` adapts the Pool room geometry; asset provenance is in `public/textures` and `public/billboard`.
- `shared/motion.ts` runs Gurgur's player controller and Box3D on both sides. `shared/room.ts` holds bitECS player state; client entity identifiers are not ECS indices. Collision covers the hall envelope, bar and stools, not decorative trim.
- `server/index.ts` owns admission, roster, simulation ticks and snapshots. The preview uses one same-origin WebSocket with separate roster and motion messages. It reuses Gurgur's motion/prediction principles, not its WebRTC transport. Rejoining assigns a new ephemeral identity.

`npm run check --workspace @harrhy/world` typechecks, tests authoritative motion and builds both bundles. With the built app running on loopback, `npm run test:browser --workspace @harrhy/world` drives two Chromium clients and checks desktop click and simulated mobile tap movement, FPS mode, departure and rejoin. Set `HARRHY_WORLD_TEST_URL` for a different disposable instance.
