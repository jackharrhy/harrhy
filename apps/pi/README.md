# Pi v0 — review import

`@harrhy/pi` owns the faithful P2 source import, not the running Pi service. This is an explicit React/Chord exception to Harrhy's Remix default. The customized interface, built-in plugin facets and names, document identities, `@p2/app/v1` ABI and subpaths, native receipts and retry deduplication remain upstream implementations. No redesign, Atlas/World integration, deletion, cutover or deployment is included.

## Layout and provenance

`upstream/` retains the source topology for `apps/p2` and its nine source packages: ai, chord, codemode, durable, env, mcp, schema, telemetry and tui. These are private vendored implementation inputs, not new Harrhy public packages. Runtime and browser resolvers use these sources rather than published `@earendil-works` implementations. See `PROVENANCE.md` and the machine-readable SHA-256 manifest.

Entry points are `scripts/start.mjs` (disposable fixture host), `scripts/check.mjs` (qualification), and upstream `apps/p2/src/hosts/{server,tui}.ts`. Upstream source tests keep their original locations as a vendor exception; new wrapper tests live in `__tests__/`.

## Setup and checks

Use Harrhy's Node 26 toolchain, Linux with Bubblewrap, and Chromium:

```sh
npm ci
npx playwright install chromium
npm run check --workspace @harrhy/pi
```

Set `CHROMIUM_BIN` for a separately installed Chromium. The check installs the nested lock with lifecycle scripts disabled, checks the app with its original TypeScript 5.9, validates public model data and source hashes, and runs runtime/restart/dedup and real-browser UI/update checks. Missing Bubblewrap or Chromium fails rather than silently skipping browser proof.

The nested npm project intentionally isolates upstream React, TypeScript, marked and their types from Harrhy's different versions. Its lock is seeded from the pinned source lock. The root marked 18.0.11 preserves the original upstream hoisting/type identity; P2 itself retains marked 18.0.14. Six high-severity npm audit findings remain in the imported development dependency chain; no unreviewed dependency upgrade is folded into this faithful import.

`npm start --workspace @harrhy/pi` starts only inside the same disposable fixture namespace: no host HOME, credentials, production data or outbound network is mounted; loopback is private to that namespace. This is not a browser preview or production startup command. State disappears on exit. New production settings, when introduced, must use `HARRHY_PI_*`; the retained `P2_*` ABI is not renamed.

## Qualification boundary

Synthetic tests cover concurrent equal retries and conflicts, retained admissions across a complete server restart, schedule recovery, exact conversation branch links, plugin updates in place, base-update reloads and refusal of stale clients. They do not establish full cold-restore compatibility for real data or exercise every external integration/native daemon. Terminal daemon binaries require a separately reviewed native build; no production binaries or private plugins are imported.

**Real-data rehearsal is NOT DONE.** No live writers were stopped, no raw snapshot was booted, and no credentials or production data were copied/mounted. A non-atomic read-only inventory, if separately provided by the live operator, is not consistent-snapshot or cold-restore proof. Any later real-data rehearsal is a separately scheduled operator-owned decision. This review PR must not merge, deploy, restart or cut over automatically.
