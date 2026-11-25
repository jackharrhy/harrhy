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

## Three-process lease fixture

The sandbox also runs \`**tests**/lease.test.ts\`. IPC only starts and reaps the
three Node children. One child owns the SQLite ACL; the other two have no
shared store and independently serve synthetic owner and Marty callbacks.
Clients and authority notifications use real Cap’n Web loopback WebSockets.

- **Committed** means the authority persisted the new epoch. **Enforced** means
  both workers acknowledged applying that epoch. A dropped notice leaves the
  result pending even after the worker’s lease expires; reconnecting applies
  the current epoch and confirms it explicitly.
- Marty’s 750 ms lease starts at the worker’s monotonic request time, so transit
  consumes rather than extends the term. A notice or expiry closes existing
  watches, and every new watch and final enqueue checks the local deadline.
  There is no automatic renewal in this fixture. Each reconnect fences old
  handles; fresh access also needs a current read grant. The owner is not leased.
- This is not immediate denial at commit under notification loss: a worker can
  enqueue while its old lease is live. The test drops one notice, not all network
  traffic, and exercises one repair schedule, not general partition recovery.
  Each watch has at most one in-flight chunk and no unsent backlog. Already
  queued socket bytes cannot be recalled. No authority restart or failover is
  modeled.

The test reports commit and enforcement round trips, attach-plus-lease time,
observed lease closure, and the signed commit-to-last-enqueue interval for its
scripted emissions. The cross-process measurements use the same Linux kernel’s
monotonic clock. They are diagnostics, not latency thresholds or estimates of
maximum partition leakage.

## Room references and transport comparison

A typed, opaque \`RoomRef\` locates a room at one booted authority; it is not a
read or send grant. The local adapter calls the same resolver directly; the
Cap’n Web adapter calls it through the authenticated socket. Resolution checks
current access and returns an epoch-bound room handle. The locator survives a
client reconnect, not an authority restart. Shared tests reject a pasted ID,
a foreign host, an outsider, and a stale room handle after revoke/regrant.

On Linux, choose two allowed logical CPUs on different cores using
\`taskset -pc $$\` and \`lscpu -e=CPU,CORE,SOCKET,ONLINE\`. From this directory run
\`NODE_BIN=/path/to/node ./room-ref-bench.sh 0 1\` (substitute your CPU IDs).
It compares sequential resolve-plus-read in-process and across independently
pinned Node client/server processes, then repeats across a loopback TCP relay
with 20 ms of application-level delay per direction. The relay also cuts the
link before an independent revoke; the same locator is denied on reconnect
until regrant. It is a simulated delay and disconnect, not a public WAN,
packet shaper, or authority-failover test. The three-process lease fixture
separately covers stale ACL state after a missed notification.

Toxiproxy was not installed; veth creation and netem on isolated loopback were
denied without additional privileges. No host changes were made. QEMU/KVM is
a later guest-isolation tier for testing separate kernels or guest failures,
not required for WAN emulation. This host had no QEMU binary on PATH and the
current user had no read/write access to /dev/kvm, so no guest was attempted.

### Optional official Toxiproxy matrix

Use Shopify’s v2.12.0 release tarball
`toxiproxy_2.12.0_linux_amd64.tar.gz` from
<https://github.com/Shopify/toxiproxy/releases/tag/v2.12.0>. Before extracting,
check the official `checksums.txt` and pinned SHA-256
`65e042d3fc2290c099527bc506446a6fd863a09f113b8944b636ece70221c2b3`.
Extract only `toxiproxy-server` to scratch. Run from this toy directory:

```sh
TOXIPROXY_BIN=/absolute/scratch/toxiproxy-server NODE_BIN=/path/to/node ./sandbox-test.sh
```

The binary runs only in the test namespace. The optional cases reuse the
RoomRef conformance suite for Marty at zero delay and fixed 20 ms each way
(no jitter). Disabling the proxy actively cuts established sockets and rejects
new TCP connections. In a separate case `timeout=0` discards downstream data
without closing TCP; the client observed no reply during a 100 ms window and
then closed its connection. These are injected TCP behaviors, not WAN traces
or evidence of distributed ACL enforcement. Normal checks skip these cases
unless the isolated runner mounts the binary.

### Layered checks

`suggestion.test.ts` is a local state fixture, not a workspace edit API. It
checks that proposals are immutable, only the owner approves the current
version, an approved version admits one input, and stale handles remain denied.
The optional proxy matrix also drops the response to a committed send (a direct
witness reads the commit before the link is cut) and disconnects one worker from
the ACL authority before revoke. The existing lease scenario checks that the
isolated worker fails closed after expiry and confirms enforcement only after
repair. Neither check implies immediate enforcement at commit under partition.
