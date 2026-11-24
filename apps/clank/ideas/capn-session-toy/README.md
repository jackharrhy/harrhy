# Disposable Cap’n Web multiplayer toy

Requires Node 26 (tested with 26.13.1). `npm ci --offline --ignore-scripts --no-audit` restores the pinned dependencies if they are in your npm cache. Run `npm ci --ignore-scripts` if the packages are not cached. Run `npm run typecheck` for strict no-emit checking of the server and tests, using Harrhy’s shared TypeScript configuration. Node runs the TypeScript directly; no build output is needed. Run `NODE_BIN=/absolute/path/to/real/node ./sandbox-test.sh` on Linux with bubblewrap (not a Node shim). The runner uses fresh PID and network namespaces, loopback only, a cleared environment, read-only code/toolchain, and scratch-local writable state. `npm test` is the unwrapped equivalent; `npm run check` runs both the typecheck and unwrapped wire tests. No daemon is installed or left running.

- `toy.ts`: two distinct ephemeral loopback WebSocket endpoints (`home`, `away`), both serving real Cap’n Web RPC. Each exposes a Familiar room by default and a separate explicit `scoped` room; the host is fixed by the endpoint. Host-scoped synthetic bearer fixtures set immutable server-side principals on upgrade. No browser origins accepted. The fixture owner represents the same logical owner on both endpoints.
- `open()` returns a principal-bound room capability. Reads, sends, and subscription polls check live ACLs. Marty starts as a viewer on home/Familiar; owner can grant read and send independently. Removing either right advances the room’s Marty epoch, invalidating all his previous room/subscription handles on that room. Acquiring a newly authorized handle is explicit. Already-delivered data cannot be revoked.
- The only send effect is appending a text event and a deterministic mock-agent acknowledgement. The terminal is inert transcript text. No command handlers, tools, external calls, or file access through RPC.
- `chooseCitation(eventIndex,start,end,destination)` records an owner-selected exact UTF-16 slice of a stored event. Destination-side send validates the opaque ID, owner role, and exact host/room destination. The citation copies only the selected excerpt and source label; it grants no source handle. Pasted text is stored verbatim with no citation metadata or authority.
- Single writer, single SQLite row for the prototype. A send commits the transcript and receipt together before replying. Retry key is (host/room, principal, client ID); identical inputs return the original receipt, changed inputs conflict. Authorization is checked before receipt lookup. SQLite survives a clean close/reopen; restart creates new listeners and requires new RPC sessions. Subscription cursors are in memory.

## Revoking push while a producer is paused

`observe(sink)` registers a typed Cap’n Web callback for future synthetic agent acknowledgements. The observer is bound to the room, principal and read epoch. After the SQLite ACL commit and before acknowledging the revoke, the server cancels invalid observers and clears their unsent backlog. Each outbound callback checks the current read grant and epoch immediately before enqueue, without yielding. A fresh grant requires a fresh room handle and observer. **Bytes already handed to the socket can still arrive after revocation**; neither socket buffers nor data already delivered can be recalled.

[Zanzibar §§2.1–2.2](https://www.usenix.org/system/files/atc19-pang.pdf) describes object–relation–subject tuples and the “new enemy” risk of evaluating new content against an ACL older than a causally prior revocation. Here, the room/principal/read relationship is just a local ACL entry. One process orders the SQLite commit and subsequent emissions; the epoch fences stale observer handles. This is not Zanzibar’s distributed consistency model and has no zookies, relation traversal, or policy engine.

## Runnable examples and fault tests

The examples in `__tests__/wire.test.ts` use inline success and rejection
assertions against real loopback sessions. Run the whole suite with
`./sandbox-test.sh` (set `NODE_BIN` as above), or run the lost-ack example
alone from this directory:

```sh
node --test --test-name-pattern='lost acknowledgment' __tests__/wire.test.ts
```

The lost-ack example records the important distinction from
[Jepsen’s operation histories](https://jepsen.io/consistency/models): a call
without a successful client completion can still have committed. It follows
[FoundationDB’s deterministic testing approach](https://apple.github.io/foundationdb/testing.html)
in using an explicit event boundary instead of a timed sleep. Only the sender’s
incoming RPC frames are dropped; a separate client observes the committed
transcript before the sender disconnects. A fresh connection must recover the
original receipt for an identical retry, reject a changed payload, and leave
the transcript unchanged. This checks one failure schedule, not a general
history checker or cluster simulation. Test teardown verifies both listeners
refuse new connections.

Limits: logical hosts share a process and store (no federation or separate trust domains); push watches have no replay or durable cursor; public toy credentials, not production auth. No crash/power-loss injection, expiry, quotas/retention, multiwriter coordination, browser UI, or production hardening. The whole store is rewritten on each mutation. The sandbox is a test harness, not a VM or external ingress service.
