# @harrhy/pool

Internal Tea package imported from 8ballworld revision `ad1dc4446e1ab8e7b32111c95f6a3479ab8e532c`.

Shared 8-ball rules, rack state, Box3D physics, physical table geometry, and shot recording schemas. Both the authoritative room server and browser prediction use this package. Physics worlds must be disposed after use.

## Entry points

- `.`: `./src/index.ts`
- `./engine`: `./src/engine.ts`
- `./table`: `./src/physical-table.ts`
- `./bot`: `./src/bot.ts` (shared shot and cue-placement planner)
- `./session`: `./src/session.ts` (async factory for a host-clocked, ephemeral two-player table)
- `./recording`: `./src/recording.ts`

- `./presentation`: browser Three.js table, cabinet, returns, balls, pendant lights and cue. `createTable(materials, { walnutUrl })` takes the walnut URL; import `walnutUrl` from the presentation module to use the bundled texture.

## Setup and checks

From the Tea root, run `npm ci` then `npm run check --workspace @harrhy/pool`. The check typechecks the source and runs its physics/protocol tests.

## Boundary

This package owns reusable game logic. The standalone presentation entry point is shared by Pool and World and does not load from the server-side entry points. App-specific presentation, authentication, WebSocket admission, storage, and deployment configuration belong to the pool app.
