# Ref live-board discussion build

This local branch combines the inline title/topbar from #269 with a board-scoped Cap’n Web session and the Astra watch/channel pair. Production `wrangler.jsonc` has neither the opt-in flag nor the `CURSORS` binding. Without both, the route returns 404 and the page doesn't open the live socket.

## Try it

From this checkout, install dependencies with `pnpm install --frozen-lockfile`, then run `pnpm --filter @harrhy/ref run build`. Set `CELLD_BIN` to the absolute path of the native executable qualified by this repo's `celld.json`, then:

```sh
bash apps/ref/scripts/discussion.sh on
```

Open `http://127.0.0.1:8787`, sign in with the local fixture, and create a board. Open its URL in a second signed-in window. Move over the canvas to see the other pointer; rename in the topbar and press Enter or tab away. Reload the other window to see the saved title. No title broadcast is implemented.

The launcher verifies the binary checksum, stages the built client and Worker into a new directory under `.ref-discussion/`, runs `celld dev` and a disposable issuer on loopback (ports 8787 and 8786), and removes that run's state on exit. No existing auth variables, real data, archives, or control plane are needed. Stop with Ctrl-C. Pass `off` instead of `on` to exercise the same build using the unchanged production binding configuration and synthetic credentials.

With the matching server running, run `pnpm --filter @harrhy/ref run test:live-board on` (or `off`) in a second terminal. Use installed Playwright Chromium. The check creates synthetic boards and signs in with independent browser cookie jars. It covers RPC and native rename, isolation, cursor expiry, editor reconnect and revocation even for clients ignoring editor teardown. The off check also exercises the #269 HTTP failure and no-JavaScript paths.

## Boundaries for discussion

- One additional WebSocket (`/api/boards/:id/canvas/live`) carries title mutation and cursor watch/move. The same-origin, board-scoped upgrade uses the current browser session. Ref's DirectoryCell owns authorization and the title business action: both transports call `renameBoard`, whose `UPDATE … RETURNING` yields the normalized result. A retained RPC client must still have a current session at mutation time. An RPC error is never replayed via HTTP. The native form and the enhanced HTTP path remain available.
- The existing BoardCell editing protocol and its storage are unchanged. The live view attaches on editor-online and is discarded on disconnect; an editor reconnect gets a fresh authorized session and snapshot. If the live socket alone fails, cursors wait for the next editor reconnect or reload, and subsequent renames can use HTTP. Decide whether a separate bounded reconnect policy is worth adding.
- The volatile CursorRoom tracks up to eight sockets, one point per peer, no identities or history. Readers sample at 150 ms; the browser coalesces writes at 150 ms; points expire after five seconds. Idle deliveries recheck authorization about every two seconds. Delivery is driven from each reader socket’s lifetime, with at most one callback in flight and a two-second deadline. Only `watch` and `channel` are shared; the room owns the deadlines, access checks, scope and revision.
- Before considering production: decide whether to ship RPC rename or retain HTTP only, whether open boards should observe other editors’ title changes, and whether the extra socket, small room cap and active polling are appropriate. This fixture is not production provisioning.
