# Clank owner preview

The owner preview is a Remix session rail, transcript and text composer backed by native Pi Chord. **New session** creates a real Pi session; **Session tools** (…) contains Rename. On phones the rail and conversation take turns; the desktop rail can collapse.

**Switch conversations.** Use Session tools → Switch conversation, or double-click the session heading. The command appears only when another conversation exists. Its picker lists the main conversation, branches and reported subagents, with the current one marked. Touch a result, or search with the keyboard and use arrows, Enter and Escape. Cmd/Ctrl+K also searches across sessions and conversations and can open the full message search. Pi's native `subagents.switch` is a contextual command; double-click is a Clank shortcut, not a required native gesture.

**Write and read.** On fine-pointer devices Enter sends by default and Shift+Enter inserts a newline. Touch Return inserts a newline; the Send button works on both. Composition events do not send. Messages go to the displayed conversation and queue as follow-ups if busy. The transcript shows recent entries, streaming replies, tool receipts, Markdown and fenced code. Sender labels come from Pi's structured entry data; quoted envelopes remain literal text. Markdown never executes HTML and links allow only HTTP(S) or mailto.

**Settings.** The footer gear controls this browser's appearance, how long inactive sessions stay in the rail, Enter to send, and composer metadata. The selected session, pinned sessions, Familiar and sessions with activity stay visible regardless of age. Changing these preferences does not write to Pi's settings. Clank renders an explicit light or dark preference into the document from the host-only `__Host-clank-theme` cookie. System follows the CSS media query, including when JavaScript is disabled. On the first JavaScript-enabled visit without that cookie, Clank migrates an existing `clank:theme` localStorage preference; the next refresh can render it server-side.

**Instance branding.** When available, Clank watches the native owner-only `p2.theme-branding` v2 contract (`plugins/settings/theme-contract.ts`) on the existing browser link. P2's settings server normalizes uploads to a bounded PNG and publishes its data URL, a tab name, and a hue. Clank renders the mark and favicon and applies the hue to its own light/dark surface tokens. Configure instance branding in P2; Clank does not call the setters, load P2 web facets, import private artwork, or fetch arbitrary asset URLs. Unconfigured or unavailable branding uses the stock mark and palette. The authenticated document includes branding if it is ready and fits the snapshot budget. The public shell never includes instance branding. Clank neither puts it in browser storage nor replays it on reconnect. The CSP permits data images, not external image hosts.

Pin a preferred session by setting `HARRHY_CLANK_FAMILIAR_SESSION_ID` or putting the exact session ID in the ignored `.celld/owner/familiar-session` file before the preview process starts. Without a match Clank does not pin or relabel another session.

The browser uses the same native Pi owner device session and Chord transport as Pi. This is **full owner access**, not a capability limited to listing or renaming: an authenticated browser can use other Pi contracts over the Chord link. The UI never receives a server-injected owner identity. Keep the preview on the private Tailnet; reachability alone does not authorize a viewer.

## Routing and authority

Use a private HTTPS ingress that preserves the original Host and browser Origin. Route it to the Clank listener, not Pi. Clank serves Remix and relays only the following Pi routes to one configured local port. With exact `Host: clank.example.test`, the complete route inventory is:

<!-- prettier-ignore -->
| Method and target | Handler |
| --- | --- |
| `GET /` | Clank Remix document; a bounded owner snapshot when Pi admits the request |
| `GET /list/other` | Clank Sessions search document; same owner snapshot policy |
| `GET /session/:key` | Owner document for a session slug or unnamed UUID; an authorized named UUID redirects to its slug, with no fallback on miss |
| `GET /owner-sessions.js` | Clank browser bundle |
| `GET /owner` | Pi sign-in document |
| `GET /owner/check` | Pi owner session check |
| `POST /owner/claim` | Pi one-time token claim; sets the native device cookie and the sign-in page returns to `/` |
| `POST /owner/logout` | Pi clears its device cookie and revokes the device link |
| WebSocket `GET /chord?client=script` | Pi native Chord upgrade and full binary stream |

Other hosts, targets, methods and query variants are rejected. The relay sends the fixed, non-secret `x-p2-proxy-secret: clank-preview` marker and preserves Host, actual Origin, Fetch Metadata, native request cookies and Pi response cookies. It does not forward Authorization, mint tokens, accept local sign-in paths, rewrite origins, or record credential data. Pi alone grants or denies the principal. Do not add a second ingress or make the backend listen on a non-loopback interface.

## Build and activation requirements

From the repository root with the pinned Node/pnpm versions:

```sh
pnpm --filter @harrhy/clank... install --frozen-lockfile --config.enable-global-virtual-store=false
pnpm --config.enable-global-virtual-store=false --filter @harrhy/clank build:owner
```

The only preview artifact is `apps/clank/.celld/owner/server.mjs` (a standalone **Node** bundle; the directory is the app’s existing ignored build-output location). The old fixture/read-only Celld artifacts are unrelated. Before activation, the operator must validate that the installed Pi is Chord-compatible with the source used to build Clank, and add the configured Clank hostname to the existing `P2_ALLOWED_HOSTS` value. This change requires a Pi restart; leave the existing canonical origin and other allowed hosts intact. Verify that the new host is treated as remote and receives a device cookie, not a local-owner cookie.

Run `node .celld/owner/server.mjs` from `apps/clank` in a bounded operator-managed process. Set `HARRHY_CLANK_PI_PORT` to the verified native Pi listener; `HARRHY_CLANK_PORT` defaults to `21975`. Set `HARRHY_CLANK_OWNER_ORIGIN` to the canonical HTTPS origin, for example `https://clank.example.test`, and route it to the one Clank port. Use a native one-time owner link for `https://clank.example.test` generated out of band on the Pi host. Never publish it or put it in daemon configuration. For teardown remove the preview lease before stopping the Clank process; stopping Clank also closes existing relayed links. Treat Pi allowlist cleanup as a separately coordinated Pi runtime change.

## Verification

Run the Clank workspace check for build and relay tests. To run the HTTPS Chromium test, first install the [isolated Pi toolchain](../../apps/pi/README.md) and Playwright Chromium. From `apps/clank` run `npm run check:owner-browser` after building the preview. The test uses OpenSSL, a disposable real Pi server, local TLS, and Chromium host mapping (no DNS or live credentials). It covers the native owner sign-in click and claim, owner cookie, inline validation and rename, two-tab Chord updates, catalog persistence, native logout and link revocation. It does not exercise the private ingress or the installed live Pi revision.

### First-document snapshot

For `GET /`, Clank may open a short-lived read-only Chord client on the existing fixed loopback Pi upgrade path. It forwards only the request’s native device-cookie slot, exact Clank Host, actual Origin and Fetch Metadata, and the usual proxy marker. It skips cross-site or non-document requests rather than rewriting them. Pi verifies the cookie and remote origin; Clank requires both native owner Access and owner Sessions before requesting data. No owner keys or credential-bearing renderer props are used.

The initial snapshot covers the sidebar, default selected session, and its recent main conversation. It has a 1.8-second deadline, a four-request concurrency cap and a 512 KiB serialized limit. Branding is read on the same authorized link, in parallel with the remaining snapshot reads. The renderer does not wait for branding. Its budget accounts for the logo in the seed, favicon and rail marks; an oversized logo is left for the browser to load over Chord. If the catalog and transcript themselves exceed the budget, or authorization fails, Clank falls back to the public shell. HTML is no-store. The composer waits for a separately authenticated browser Chord binding before enabling writes; the server closes its request-scoped link after reading.
