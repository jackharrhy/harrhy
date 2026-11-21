# How standalone Clank follows Pi sessions

Clank signs a viewer into a **disposable loopback fixture**. Loading the page renders a Remix shell; hydrating the session list opens one same-origin WebSocket. There is no `/sessions?after=…` endpoint or timeout-driven read. Edits from any authorized fixture client reach the other connected views without navigation.

```text
Remix clientEntry SessionList ── /live (Cap’n Web SessionApi) ──► SessionCell
                                                                        │
                                                      Cap’n Web WebSocket /rpc
                                                                        │
                                                    fixture bridge in Node Pi
                                                                        │
                                               Chord owner Sessions reference
```

## The unit of state

Pi's `plugins/sessions/web.tsx:useSidebarData` obtains `Sessions` and reads its `sessions` member. The sidebar also joins reads, activity, worker status, child agents, operations and project/rollup preferences from other sources. Clank follows the **session catalog** portion, not the entire composite sidebar. The [projection and reducer](../../apps/clank/app/session-state.ts) cover the public `SessionSchema`: ID, title, cwd, environment, model provider/ID, thinking level, creation/update/archive times, pin, main conversation and branch labels/parents. The active list and archive are views of that model. Branches are conversation metadata, not messages. No raw `Catalog` table rows, provider configuration, project preferences, worker plugin state or transcripts cross the bridge. Absolute working directories and branch labels are owner data too; this is not an anonymous feed.

## Binding and delivery

1. [The worker](../../apps/clank/standalone.tsx) verifies the configured Clank Basic credential, exact loopback origin and upgrade. Only `/live` reaches the named cell. [SessionCell](../../apps/clank/app/session-cell.ts) accepts a **regular, non-hibernating** socket and opens one outbound WebSocket to the fixed Node bridge. The private service credential is supplied only on this second handshake, in `Sec-WebSocket-Protocol`. The browser does not speak Chord, receive a Pi cookie or obtain a generic RPC proxy.
2. [The bridge](../../apps/clank/bridge.ts) refuses other paths, browser origins, wrong service credentials and excess peers before upgrading. It creates a bidirectional Cap’n Web session: `Fixture.execute` is its narrowly scoped command target; `StateSink.deliver` is the peer's main capability. The cell is the endpoint of **two separate RPC sessions**. Its [browser API](../../apps/clank/app/session-api.ts) exposes only `watch(receive)`, `create(epoch, title)`, `rename(epoch, id, title)` and `archive(epoch, id)`. The cell checks the epoch, validates the named command, calls the private bridge and returns no upstream capability. The temporary Node adapter can be replaced without exposing Chord or changing the browser interface.
3. For each admitted connection, `host.root(..., withAbortSignal(...), {principal: {kind: 'owner', access: 'local'}})` acts as a **trusted same-host fixture caller**. `ctx.get(Sessions,{})` binds the authorized contract. The bridge checks `variant === 'owner'`, watches `state` for loss of the live binding, acquires a `sessions.watch(ctx)` and uses **that watch's acquisition value** for `(epoch, seq=0, snapshot)`. The cell opens the outbound bridge socket during the upgrade: an attempt to open it from inside the later `watch` RPC got an outbound socket error on the pinned binary. A single bounded rendezvous holds the first delivery until the cell has retained the browser callback with `dup()`. Chord holds changes even before `watch.start`. No read→subscribe gap.
4. Chord JSON watch callbacks are serialized. `diff(previous, project(call.value))` produces keyed row puts/removals from the last delivered projection; no repeated snapshots or forwarding ops against an internal representation. The [Clank provider](../../apps/clank/app/clank-provider.tsx) applies exactly the next sequence in the same epoch and acknowledges **after `handle.update()`**. The cell awaits `receive(frame)`; that RPC completes when the browser callback returns. Only then does `StateSink.deliver` return to Node. No application-level ack or command-result envelope is needed. Thus one state frame is outstanding, and Chord folds intervening changes to the next useful value. This delivers ordered state, not a lossless mutation log. Sorting by pin/activity/ID is local presentation.
5. A disconnect, stale command epoch, gap or broken binding ends the connection. The client discards the old model, disables writes and backs off to 5 s between attempts. A new binding always gets an authoritative snapshot in a new epoch. An interrupted command is not replayed; check the refreshed view. On component removal/pagehide the browser stops reconnecting. On either socket closing Celld closes its other peer and disposes the retained callback and both session roots. The Node abort signal releases the Chord root, its reference and watches; stubs are disposed. No durable object storage writes are needed.

`create`, `rename` and `archive` are explicit fixture commands, not patches to browser state. Node selects the fixed fake model and fixture cwd, checks that an edited row is active, and calls the **owner Sessions method**, e.g. `sessions.rename({ id: row.id, title: command.title }, ctx)`. No caller-supplied principal, credential, filesystem path or general method name. A command result is not authoritative state: the watch supplies that.

Limits: eight viewers, one outstanding write and delivery per connection, 256 rows, 128 branches per row, 192 KiB of serialized row data, 4 KiB inbound browser RPC limit at the cell and 120 characters per command title. Binding, commands and reader acknowledgements time out at 8 s on the bridge; the browser also has a bind deadline. The cell closes a connection after 30 minutes to require another handshake. Rotate static fixture secrets by replacing the private bindings and restarting both fixture processes. This is **not** a production identity, dynamic entitlement revocation or multi-tenant model. The named cell holds no replay buffer. Node projection/diff work is O(rows) per delivered watch call per viewer, despite incremental wire size. Do not scale these limits up blindly.

## Local selectors, one remote watch

One [ClankProvider](../../apps/clank/app/clank-provider.tsx) per hydrated screen owns the socket, watch, retry timer and command admission. It sets a stable Remix context object once. A selection is local; mounting a row does not open a watch on Pi.

```tsx
const app = handle.context.get(ClankProvider);
const rows = app.sessions.select((state) => state.activeRows);
rows.subscribe(() => handle.update(), { signal: handle.signal });
// In render, pass each summary to its row, keyed by row.id.
```

`current` reads the current slice, including before subscribing. The [store](../../apps/clank/app/session-store.ts) notifies on subsequent changes using `Object.is`. Aborting the signal or calling the returned cleanup unsubscribes the listener. Publication awaits the listeners’ render promises before the provider returns from the Cap’n Web callback. Select a stable leaf rather than allocating a fresh object on every read.

The [ordered list](../../apps/clank/app/sessions.tsx) subscribes once to the visible active or archive summaries. The reducer keeps unchanged row objects and reuses the other list’s array if its rows and order did not change. A visible rename therefore renders the list even if its order stays the same. Each keyed row reads its summary and command availability from props; neither the row nor its buttons subscribe. The connection pane selects only connection status and notice. The selector API still supports individual fields such as `state.byId[id]?.title` for consumers that need them.

## Runtime and browser evidence

Before changing the transport, the executable behind the running standalone unit was verified with `scripts/celld-runtime.mjs verify` against `celld.json` (`0.6.3-jh.1`, SHA-256 `43072e8ecb4a8aa60e91f91eac246d9b087b013f7ef2a1e35bd0556aabc0dd40`). In a throwaway store on loopback, that binary accepted `new WebSocketPair()` / `accept()` / HTTP 101 and opened `new WebSocket(url, protocol)` from the same cell to a Node echo peer. An upstream push followed by a second client-initiated round trip both reached the client. The integrated test then exercised the same APIs with **Cap’n Web 0.13.0**, the actual fixture host and Chromium.

[Browser acceptance script](../../apps/clank/__tests__/live-fixture.mjs): two hydrated pages, one editing and one observing. One measured run on this host:

<!-- prettier-ignore -->
| Observation | Result |
| --- | --- |
| Navigate both pages to both live | 139 ms |
| Initial bind | 12 rows; 4,215 inbound RPC bytes on the observing tab during both-page bind |
| Create / rename / archive → visible on the second page | 94 / 66 / 75 ms |
| Observer inbound RPC bytes during those actions | 475 / 483 / 492 bytes |
| Rename with four visible rows | 1 list render, 4 keyed row renders, 0 connection-pane renders; the unsent title edit survived; 1 socket and 1 watch on the observing page |
| Reader idle for 10 seconds (longer than the former poll timeout) | 0 additional HTTP requests, 0 sent/received WS application frames |
| Reader disconnect → authoritative rebind visible | 810 ms; archive view restored. Independent RPC rebind also verified new epoch, sequence zero and archived row |
| Reader holding its first ack across all three edits | One coalesced delta containing the final archived, renamed row |
| Reader never acknowledging | One snapshot, disconnected after 8,010 ms |
| Closing all pages | Established Node bridge TCP connections returned to baseline (one pre-existing connection) |

[Chromium precise coverage](../../apps/clank/__tests__/render-counts.mjs) counts invocations of the render functions in the served bundle, not DOM mutations. The test counts outbound `watch` calls as well as upgrades: one before reconnect and one replacement after. The teardown check compares host bridge connections before and after the test; run with a stable fixture baseline, not while another client is reconnecting.

The script also checks unauthenticated and foreign-origin upgrades, direct unauthenticated RPC, the absent polling endpoint, an unknown session command, stale-epoch disconnect and a browser context with zero cookies. Byte counts sum inbound WebSocket payloads received by the observing tab during each measurement; they include Cap’n Web protocol traffic, not WS/TCP headers; timings include Playwright action/visibility waits. These are individual small loopback observations, **not** percentiles, a capacity test, a WAN latency budget or proof of hibernation/failover. Basic sign-in uses the browser credential cache, not application cookies. Use an isolated profile; ports are not cookie isolation.

The small seam worth reusing is the scoped snapshot/change reducer and acknowledged subscription lifecycle. The authentication, Pi projection and commands are deliberately Clank-specific. No Ref code or shared framework is required.

A separate live-browser run restarted only the disposable Pi service while the page stayed open. It displayed disconnected, then accepted a fresh epoch and snapshot in 4,947 ms including service restart and client backoff. All four archive rows were restored with just the original document navigation. No polling fallback was involved.
