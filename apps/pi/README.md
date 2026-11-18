# Pi v0

`@harrhy/pi` owns the faithful P2 app source, not the running Pi service. This is an explicit React/Chord exception to Harrhy's Remix default. The customized interface, built-in plugins and names, document identities, `@p2/app/v1` ABI and subpaths, native receipts and retry deduplication remain intact. No redesign, cutover or production deployment is included.

## Layout

App implementation lives directly in `src/`, `plugins/`, `public/`, `scripts/` and `voice-server/`, preserving upstream names and relative structure. Shared compatibility source lives in `compat/packages/`; it is checked in, not fetched or supplied as opaque archives. `harrhy/` contains the small install, qualification and sandbox adapters. Focused tests live in `__tests__/`. See [UPSTREAM.md](UPSTREAM.md) for the deterministic path map and reviewed update procedure, and [PROVENANCE.md](PROVENANCE.md) for the source baseline and exclusions. Preserve upstream formatting; do not mass-rename or reformat retained implementation.

The host entry points remain `src/hosts/{server,tui}.ts`. `npm start` invokes only Harrhy's disposable fixture sandbox, not a production host.

## Setup and checks

Use Harrhy's Node 26 toolchain, Linux with Bubblewrap, and Chromium:

```sh
npm ci
npx playwright install chromium
npm run check --workspace @harrhy/pi
```

Set `CHROMIUM_BIN` for separately installed Chromium. The check installs the isolated `compat/package-lock.json` with lifecycle scripts disabled, links its dependencies for the app, checks with TypeScript 5.9, validates the public model catalog and provenance, then runs isolated runtime and real-browser checks. Missing Bubblewrap or Chromium fails rather than silently skipping browser proof. The nested npm boundary preserves upstream React and marked/type identities independently of Harrhy root versions. Six high-severity findings remain in the inherited development dependency chain; no unreviewed upgrade is folded into this import.

`npm start --workspace @harrhy/pi` runs only in a disposable namespace: no host HOME, credentials, production data or outbound network is mounted; loopback is private to that namespace. State disappears on exit. This command is not the separately authorized private review preview. New production settings must use `HARRHY_PI_*`; the retained `P2_*` ABI is not renamed.

## Boundaries

Synthetic checks cover equal retries and conflicts, retained admissions across complete server restart, schedule recovery, exact conversation branch links, plugin updates in place, base-update reloads and stale-client refusal. They do not qualify every external integration or native daemon. Native daemon source/build inputs are retained; production binaries and private plugins are not imported.

**Real-data rehearsal is NOT DONE.** No live writers were stopped, raw snapshot booted, or credentials/production data copied or mounted. The operator's partial, non-atomic read-only inventory is not cold-restore proof. No merge, deployment, restart or cutover is authorized by this PR. A separate synthetic preview must use fresh state, owner authentication and explicit filesystem/network isolation.
