# How standalone Clank follows Pi sessions

Clank signs a viewer into a **disposable loopback fixture**. Loading the page renders a Remix shell; hydrating the session list opens one same-origin WebSocket. There is no `/sessions?after=…` endpoint or timeout-driven read. Edits from any authorized fixture client reach the other connected views without navigation.

```text
Remix clientEntry SessionList ── /live (JSON state / ack / command) ──► SessionCell
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
2. [The bridge](../../apps/clank/bridge.ts) refuses other paths, browser origins, wrong service credentials and excess peers before upgrading. It creates a bidirectional Cap’n Web session: `Fixture.execute` is its narrowly scoped command target; `BrowserSink.deliver` is the peer's main capability. Neither endpoint exports the Chord host. One socket owns both root stubs; no callback registry or history survives it.
3. For each admitted connection, `host.root(..., withAbortSignal(...), {principal: {kind: 'owner', access: 'local'}})` acts as a **trusted same-host fixture caller**. `ctx.get(Sessions,{})` binds the authorized contract. The bridge checks `variant === 'owner'`, watches `state` for loss of the live binding, acquires a `sessions.watch(ctx)` and uses **that watch's acquisition value** for `(epoch, seq=0, snapshot)`. Chord holds changes even before `watch.start`. No read→subscribe gap.
4. Chord JSON watch callbacks are serialized. `diff(previous, project(call.value))` produces keyed row puts/removals from the last delivered projection; no repeated snapshots or forwarding ops against an internal representation. The [Remix component](../../apps/clank/app/sessions.tsx) applies exactly the next sequence in the same epoch and acknowledges **after `handle.update()`**. The pending `BrowserSink.deliver` RPC resolves only on that acknowledgement. Thus one state frame is outstanding, and Chord folds intervening changes to the next useful value. This delivers ordered state, not a lossless mutation log. Sorting by pin/activity/ID is local presentation.
5. A disconnect, stale epoch/ack, gap or broken binding ends the connection. The client discards the old model, disables writes and backs off to 5 s between attempts. A new binding always gets an authoritative snapshot in a new epoch. An interrupted command is not replayed; check the refreshed view. On component removal/pagehide the browser stops reconnecting. On either socket closing Celld closes its other peer and rejects its pending ack. The Node abort signal releases the Chord root, its reference and watches; stubs are disposed. No durable object storage writes are needed.

`create`, `rename` and `archive` are explicit fixture commands, not patches to browser state. Node selects the fixed fake model and fixture cwd, checks that an edited row is active, and calls the **owner Sessions method**, e.g. `sessions.rename({ id: row.id, title: command.title }, ctx)`. No caller-supplied principal, credential, filesystem path or general method name. A command result is not authoritative state: the watch supplies that.

Limits: eight viewers, one outstanding write and delivery per connection, 256 rows, 128 branches per row, 192 KiB of serialized row data, 1,024 browser command characters, bounded RPC message size. Binding, commands and reader acknowledgements time out at 8 s on the bridge; the browser also has a bind deadline. The cell closes a connection after 30 minutes to require another handshake. Rotate static fixture secrets by replacing the private bindings and restarting both fixture processes. This is **not** a production identity, dynamic entitlement revocation or multi-tenant model. The named cell holds no replay buffer. Node projection/diff work is O(rows) per delivered watch call per viewer, despite incremental wire size. Do not scale these limits up blindly.

## Runtime and browser evidence

Before changing the transport, the executable behind the running standalone unit was verified with `scripts/celld-runtime.mjs verify` against `celld.json` (`0.6.3-jh.1`, SHA-256 `43072e8ecb4a8aa60e91f91eac246d9b087b013f7ef2a1e35bd0556aabc0dd40`). In a throwaway store on loopback, that binary accepted `new WebSocketPair()` / `accept()` / HTTP 101 and opened `new WebSocket(url, protocol)` from the same cell to a Node echo peer. An upstream push followed by a second client-initiated round trip both reached the client. The integrated test then exercised the same APIs with **Cap’n Web 0.13.0**, the actual fixture host and Chromium.

[Browser acceptance script](../../apps/clank/__tests__/live-fixture.mjs): two hydrated pages, one editing and one observing. One measured run on this host:

<!-- prettier-ignore -->
| Observation | Result |
| --- | --- |
| Navigate both pages to both live | 152 ms |
| Initial snapshot | 5 rows, 1,725 bytes |
| Create / rename / archive → visible on the second page | 75 / 49 / 65 ms |
| Incremental application payloads | 414 / 422 / 431 bytes, one row each, sequence 1 / 2 / 3 |
| Reader idle for 10 seconds (longer than the former poll timeout) | 0 additional HTTP requests, 0 sent/received WS application frames |
| Reader disconnect → authoritative rebind visible | 807 ms; new epoch, sequence zero, 6 rows |
| Reader holding its first ack across all three edits | One coalesced delta containing the final archived, renamed row |
| Reader never acknowledging | One snapshot, disconnected after 8,006 ms |
| Closing all pages | Established Node bridge TCP connections returned to baseline (zero) |

The script also checks unauthenticated and foreign-origin upgrades, direct unauthenticated RPC, the absent polling endpoint, an unknown session command, stale-epoch disconnect and a browser context with zero cookies. Byte counts exclude WS/TCP and RPC framing; timings include Playwright action/visibility waits. These are individual small loopback observations, **not** percentiles, a capacity test, a WAN latency budget or proof of hibernation/failover. Basic sign-in uses the browser credential cache, not application cookies. Use an isolated profile; ports are not cookie isolation.

The small seam worth reusing is the scoped snapshot/change reducer and acknowledged subscription lifecycle. The authentication, Pi projection and commands are deliberately Clank-specific. No Ref code or shared framework is required.

A separate live-browser run restarted only the disposable Pi service while the page stayed open. It displayed disconnected, then accepted a fresh epoch and snapshot in 4,925 ms including service restart and client backoff. No page reload or polling fallback was involved.
