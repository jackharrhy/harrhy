# Clank

Standalone Clank is a Remix 3 session list for a disposable Pi. Create a fixture session, rename it, or archive it in one tab and other tabs update over a persistent WebSocket. See [realtime sessions](../../docs/clank/realtime-sessions.md) for the authorization boundary, Chord watch lifecycle, wire model, limits and measured browser behavior.

## Standalone fixture

- `standalone.tsx` serves the document, hydrated component bundle and authorized `/live` upgrade. `app/session-cell.ts` owns its peer sockets. `bridge.ts` runs **inside the disposable Node Pi process**, never inside Celld or the browser. Pi data is authoritative.
- From the repository root: `npm run check -w @harrhy/clank`. This builds both browser entries and the standalone worker, copies its Celld config under the ignored `.celld/standalone/`, and runs unit tests. To run the Clank TypeScript check with Pi’s installed fixture toolchain: `node apps/pi/compat/host/node_modules/typescript/bin/tsc -p apps/clank --noEmit`. See the [Pi setup](../pi/README.md) for the isolated Pi dependencies.
- Use only the [verified native Celld artifact](../../docs/celld-runtime.md). The existing operator-managed fixture starts Pi with `fake:true` and an explicit private data directory. After `startServer`, its launcher calls `startFixtureBridge(server.host, dataDir, token)`. The token is 32 random bytes encoded as lowercase hex. Never supply a live host or register this adapter as a Pi plugin. There are no production bindings.
- Keep `HARRHY_CLANK_BRIDGE_TOKEN` and `HARRHY_CLANK_VIEW_PASSWORD` in private fixture bindings. The latter now authorizes the three specified fixture writes, not just viewing. In `apps/clank`, the standalone invocation is `celld dev .celld/standalone/wrangler.jsonc --host 127.0.0.1 --port 18148 --no-watch`. Node's bridge listens only on `127.0.0.1:18149`. Do not proxy or publish either listener. Rotate bindings by restarting both processes. Use a clean browser profile on the standalone origin, separate from Pi sign-in.
- With these fixture units running, `npm run check:fixture -w @harrhy/clank` exercises real Chromium, includes an idle and stalled-reader interval, and leaves one archived test session. Requires the private fixture password file, Chromium for Playwright, Linux `ss`, and capacity in the fixture catalog. It does not restart services or use any Pi credential.

## Other preserved fixture work

`worker.ts` and `app/browser.tsx` are the earlier **separate Pi-origin prototype**, not a standalone fallback. Its disposable gateway routes `/clank` and `/clank/assets/clank.js` to that worker and other paths (including `/owner/check` and `/chord`) to Pi. `HARRHY_CLANK_ORIGIN` must match that gateway. This prototype, unlike standalone, trusts browser code with the current Pi owner's same-origin access. Do not use it for standalone sign-in. The build uses the Pi source and Chord aliases from this checkout; build from the fixture revision.

`preview/` is the existing, separate loopback Go color-demo service; it is not part of session synchronization. Test in that directory with `go test main.go main_test.go`.
