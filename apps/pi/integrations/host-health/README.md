# Host health

An optional server plugin that wakes a private Pi conversation when the Pi server’s root filesystem runs low. It polls `/` once a minute using filesystem blocks available to unprivileged processes. Install it only where Pi sees the filesystem you want to monitor; a container may see a different root.

- Below **15 GiB** twice in a row: emit a low-space alert.
- Below **5 GiB** once: emit a critical alert, even if low space already alerted.
- Above **20 GiB** twice in a row: rearm without sending another message.

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

Use `list` and `setEnabled` with the current revision to inspect or stop the subscription. There is no separate settings page. A revised binding starts a new watch; previously admitted alerts may still be handled.

## Response runbook

Set the response policy in the target conversation before enabling the watch. On alert, recheck free space on the named host, notify the configured operator session promptly, and report the largest actionable consumers. Prune only caches the owner has approved as disposable. If inactive worktrees are the better target, request a bounded cleanup from their owning session and report measured before/after space. The event does not authorize volume pruning, deletion of source or work in progress, or service restarts.
