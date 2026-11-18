# External stimulus sources

Installed server plugins can declare a typed source and publish external input to an authorized, persisted subscription. The stimuli plugin owns the subscription, immutable delivery and retry intent. The target worker owns native input, receipt and settlement. No additional database, inbox or dispatcher is involved.

## Declare, authorize, bind

```ts
import { obj, str } from "@earendil-works/pi-schema";
import { defineFacet } from "@p2/app/v1";
import {
  bindStimulusPublisher, defineStimulusSource, sourceKey, StimulusSources,
} from "../stimuli/contract.server.ts";
import { WakeStore } from "../stimuli/contract.ts";

const AdminAsk = defineStimulusSource({
  id: "example.admin-ask", version: 1, label: "Admin request",
  configSchema: obj({ resource: str(), allowedActor: str() }),
  eventSchema: obj({ actor: str(), text: str() }),
  render: (event, config) => {
    if (event.actor !== config.allowedActor) throw new Error("Unauthorized actor");
    return `${config.resource}: ${event.actor}: ${event.text}`;
  },
});

export default defineFacet((_host, self) => {
  self.contribute(StimulusSources, { [sourceKey(AdminAsk)]: AdminAsk });
});

// In an authenticated server adapter, using its host context:
const store = await ctx.get(WakeStore, {});
const subscription = (await store.subscriptions({}, ctx)).find((row) => row.id === "admin-inbox");
if (!subscription) throw new Error("Subscription not registered");
const publisher = bindStimulusPublisher(store, AdminAsk, subscription);
await publisher.publish({ eventId: stableRequestId, event: authenticatedEvent }, ctx);
await publisher.receipt({ eventId: stableRequestId }, ctx);
```

The owner creates the subscription through `Subscriptions`' owner variant:

```ts
await subscriptions.createTarget({
  id: "admin-inbox",
  source: { id: "example.admin-ask", version: 1 },
  target: { session, conversation },
  config: { resource: "reviewed-resource", allowedActor: "reviewed-actor" },
}, ctx);
```

`reviseTarget` changes configuration or the exact target using `expectedRevision`. `setEnabled` also requires the current revision. Changed revisions retire previous publishers. The source ID/version stays fixed for a subscription's lifetime; changing it requires a new subscription. `list` returns saved registrations, including their actual configuration and fingerprint. Do not put secrets in configuration or events.

The worker variant has `create` and `revise` with a conversation but no session selector. It derives the authenticated worker's session, checks its generation, and scopes `list`/`setEnabled` to that session. Guests cannot bind this interface. Registration and enabling require a private, unarchived session and an existing writable conversation. Existing input gates and read-only policy still run at admission.

Only trusted installed server code can contribute sources or obtain the local store. There is no remote source registration or general publication endpoint. An adapter must authenticate its ingress and authorize resource/actor policy before invoking its bound publisher; JSON actor fields are evidence, never p2 owner authority. A publisher has no target selector and fixes source/version/subscription/revision. Neither the browser nor an external caller should receive a p2 owner credential.

## Persistence and acknowledgements

Configuration and events are JSON, checked against source-specific schemas. Each is limited to 32,768 encoded UTF-8 bytes; rendered text must be 1–32,768 UTF-8 bytes. Event IDs are 1–256 characters. The renderer must be pure: it runs once when a new event is materialized, inside the saved-state change. Canonical event digests ignore object-key order but preserve array order. Identical concurrent publication returns the same immutable envelope; changed content under that identity conflicts.

The event identity includes source ID/version, subscription ID/revision and event ID in a namespace disjoint from timers. Publication saves exact target, rendered text, source label, event/configuration digests and binding identity before dispatch. Replays never render again, including after restart, disable, revision change or provider removal.

Readback returns:

- `recorded`: saved intent exists; inspect its phase, including closed/unattempted work.
- `unknown`: an admission may be in flight or its outcome is uncertain.
- `admitted`: an authoritative native receipt has been recovered; its phase includes native settlement when known.
- `missing`: no event exists at this binding/event identity.

Errors reject invalid, conflicting or retired new publication. Neither recorded nor admitted means a business operation succeeded. An observer checkpoints its durable source cursor **after** publish acknowledges persisted acceptance. A crash before checkpoint replays the same event ID. Never generate a fresh ID to hide an uncertain retry.

The existing runner serializes outstanding native obligations per session; other sessions progress independently. Disable/revision change closes unattempted work, leaves possibly attempted work readback-only, and follows admitted work to native `done`/`unanswered`. An in-flight admission can win a disable race. Missing readback does not prove a late commit impossible.

Source absence pauses unattempted source rows without blocking timers. Registry changes resume reconciliation. Already attempted work can recover native receipts and settlement without its source provider. Restored providers dispatch saved bytes, not a replacement renderer. Archive/sharing retain the existing blocking policy; disabling remains possible without the source provider or worker.

Native `PEER_MESSAGE_ENTRY` records keep external source attribution and server-stamped `stimulus` metadata (`deliveryId`, `sourceVersion`, `subscriptionId`, `revision`, `eventId`) in the same transaction as input submission and receipt creation. Equal retries preserve the receipt and native entry. Legacy Hermes ingress and one-shot wake wire schemas, identities and receipt ledgers are unchanged. Persisted v1 wakes migrate without rewriting their rows.

## Runnable portable examples and fault checks

These fixtures use disposable real Chord/Durable stores and the fake model, not live services or credentials. From `apps/p2`:

```sh
# Synthetic authenticated admin boundary, owner registration, revision confinement,
# equal concurrent retries, schema/size rejection and native provenance after restart.
node --import ./src/source.ts --test test/p2/stimuli-sources.test.ts

# Mailbox observer: stable UID identity, duplicate Message-ID, durable cursor replay,
# missing provider, timer progress and restored-provider dispatch of saved bytes.
node --import ./src/source.ts --test test/p2/stimuli-mailbox.test.ts

# Lost native acknowledgement, disable/readback-only, both stores reopened and once-only input.
node --import ./src/source.ts --test test/p2/stimuli-lifecycle.test.ts

# Actual persisted v1 state and released caller compatibility.
node --import ./src/source.ts --test test/p2/stimuli-migration.test.ts
```

No mail, Rotund or CI adapter is deployed by this slice. The built-in recurring-prompt adapter is documented in [schedules.md](schedules.md): it uses this public source API, stable occurrence IDs and a durable cursor, with explicit timezone and missed-run semantics. Other heartbeat/observer adapters remain separate work. There are no new count quotas, global pools, admission deadlines, coalescing, pruning or automatic business actions.
