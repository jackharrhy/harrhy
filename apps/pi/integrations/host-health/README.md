# Host health

An optional Linux server plugin that wakes a private Pi conversation on host resource pressure. Only metrics with an enabled watch are read, at most once per poll. Watches share a one-minute interval. These presets apply when a subscription omits its rule:

<!-- prettier-ignore -->
| Check | Warning | Critical | Rearm (two readings) |
| --- | --- | --- | --- |
| `disk-root` | Available space below 15 GiB twice | Below 5 GiB | Above 20 GiB |
| `cpu` | Busy above 90% for five sample intervals | — | Below 75% |
| `memory` | Available memory below 10% three times | Below 3% | Above 15% |

Disk uses blocks available to unprivileged processes. CPU uses aggregate Linux counter deltas, excluding idle and I/O wait. Memory uses `MemAvailable / MemTotal` so reclaimable cache is not counted as pressure. Install only where Pi sees the intended host resources; these are not container quota checks.

Each severity fires at most once per incident per subscription. The cursor and pending event survive restarts; a retry reuses the original event and identity. The plugin samples nothing without an enabled subscription. It needs no credentials, incoming endpoint, or cleanup privileges. It cannot deliver if Pi is offline or cannot persist its state.

## Enable

Install as described in [Optional integrations](../README.md). Through an authenticated owner client, use the existing `Subscriptions` owner API from [External stimuli](../../docs/external-stimuli.md):

```ts
await subscriptions.createTarget({
  id: "root-space",
  source: { id: "p2.host-health", version: 1 },
  target: { session, conversation },
  config: { check: "disk-root" },
}, ctx);
```

Create one subscription per check with a distinct ID; use `cpu` or `memory` instead of `disk-root` for the other checks. Use `list` and `setEnabled` with the current revision to inspect or stop the subscription. There is no separate settings page. A revised binding starts a new watch; previously admitted alerts may still be handled.

## Custom rules

Add a `rule` to the subscription configuration, for example:

```json
{
  "check": "memory",
  "rule": {
    "trigger": { "op": "below", "value": 33.333 },
    "rearm": { "op": "above", "value": 40 },
    "samples": 3,
    "rearmSamples": 2
  }
}
```

Use `above`, `below`, or inclusive `between` (with `min` and `max`). Disk values are in GiB; CPU and memory use percentages from 0 to 100. Trigger and rearm conditions must not overlap. A custom rule replaces the preset, including its critical threshold. Custom rules default to one trigger reading and two rearm readings.

With owner authorization, an agent can use the `host_health` tools to create a watch for its current private conversation, list watches scoped to its session, and pause or resume them. The server uses Pi’s existing subscription authorization for these calls.

## Response runbook

Set the response policy in the target conversation before enabling the watch. On alert, recheck the reported resource on the named host, notify the configured operator session promptly, and report the largest actionable consumers. Prune only caches the owner has approved as disposable. If inactive worktrees are the better target, request a bounded cleanup from their owning session and report measured before/after space. The event does not authorize volume pruning, deletion of source or work in progress, or service restarts.
