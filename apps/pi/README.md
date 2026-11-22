# Pi v0

`@harrhy/pi` owns the faithful P2 app source, not the running Pi service. This is an explicit React/Chord exception to Harrhy's Remix default. The customized interface, built-in plugins and names, document identities, `@p2/app/v1` ABI and subpaths, native receipts and retry deduplication remain intact. No redesign, cutover or production deployment is included.

## Layout

App implementation lives directly in `src/`, `plugins/`, `public/` and `scripts/`, preserving upstream names and relative structure. Shared compatibility source lives in `compat/packages/`; it is checked in, not fetched or supplied as opaque archives. `harrhy/` contains the small install, qualification and sandbox adapters. Focused tests live in `__tests__/`. See [UPSTREAM.md](UPSTREAM.md) for the deterministic path map and reviewed update procedure, and [PROVENANCE.md](PROVENANCE.md) for the source baseline and exclusions. Preserve upstream formatting; do not mass-rename or reformat retained implementation.

The host entry point remains `src/hosts/server.ts`; Pi is used through the web interface. `npm start` invokes only Harrhy's disposable fixture sandbox, not a production host.
For a standalone supervised server, set an absolute `P2_DATA_DIR` and run `node --import ./src/source.ts ./harrhy/run-server.mjs` from `apps/pi`. It binds loopback, respects the retained host settings, and does not mint a sign-in token on boot.
Automatic Rex mirroring is no longer included; standalone Rex and existing panes are unaffected by this source change.

## Setup and checks

Use Harrhy's Node 26 toolchain, Linux with Bubblewrap, and Chromium:

```sh
npm ci
npx playwright install chromium
npm run check --workspace @harrhy/pi
```

Set `CHROMIUM_BIN` for separately installed Chromium. The check installs the isolated `compat/package-lock.json` with lifecycle scripts disabled, links its dependencies for the app, checks with TypeScript 5.9, validates the public model catalog and provenance, then runs isolated runtime and real-browser checks. Missing Bubblewrap or Chromium fails rather than silently skipping browser proof. The nested npm boundary preserves upstream React and marked/type identities independently of Harrhy root versions. Six high-severity findings remain in the inherited development dependency chain; no unreviewed upgrade is folded into this import.

`npm start --workspace @harrhy/pi` runs only in a disposable namespace: no host HOME, credentials, production data or outbound network is mounted; loopback is private to that namespace. State disappears on exit. This command is not the separately authorized private review preview. New production settings must use `HARRHY_PI_*`; the retained `P2_*` ABI is not renamed.

## Configuration

Owners can use **Settings → Theme** to tint the web interface independently of light/dark mode or upload a sidebar logo (PNG, JPEG or WebP, up to 512 × 512 pixels and 500 kB). Reset either setting to restore the default Pi appearance.

The [Pi Inbox](../../docs/pi-inbox.md) and Atlas feedback are optional host plugins. See [Optional integrations](integrations/README.md). A base start does not register their endpoints.

Features taken out of Pi, with what each did and what is worth bringing back, are in [removed features](../../docs/pi-removed-features.md).

The retained settings/model APIs use the selected instance's data directory, not Harrhy repository files. Read `plugins/models/model-config.ts` and `src/runtime/settings.ts` before changing settings. Never point a fixture or preview at live `P2_DATA_DIR`, copy production auth/configuration, or treat `P2_FAKE` alone as isolation. The preview and fixture wrappers must supply an explicit reviewed plugin selection and network/filesystem boundary.

`HARRHY_PI_HTTP_PROXY` explicitly opts server and session-worker fetch into the supplied HTTP proxy URL for both HTTP and HTTPS destinations. Without it, fetch retains its direct HTTP/1.1 dispatcher and ignores ambient proxy variables. Both modes disable HTTP/2. Proxy mode always bypasses `localhost`, `127.0.0.1` and `[::1]`; ambient `NO_PROXY` does not override that fixed bypass list. This is an outbound fetch setting: it does not enforce destination restrictions. A preview's restricting proxy and sandbox own that boundary; this setting does not authorize access to live data.

## Boundaries

Synthetic checks cover equal retries and conflicts, retained admissions across complete server restart, schedule recovery, exact conversation branch links, plugin updates in place, base-update reloads and stale-client refusal. They do not qualify every external integration or native daemon. Native daemon source/build inputs are retained; production binaries and private plugins are not imported.

**Real-data rehearsal is NOT DONE.** No live writers were stopped, raw snapshot booted, or credentials/production data copied or mounted. The operator's partial, non-atomic read-only inventory is not cold-restore proof. No merge, deployment, restart or cutover is authorized by this PR. A separate synthetic preview must use fresh state, owner authentication and explicit filesystem/network isolation.
