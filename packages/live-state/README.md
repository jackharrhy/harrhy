# @harrhy/live-state

A private workspace containing the `watch` and `channel` pair from the Slides Astra fixture (`2d88ecfb`). Ref's local [live-board discussion build](../../docs/ref/live-board-discussion.md) is the first consumer.

- `@harrhy/live-state/watch`: `watch(render, ordered?)` owns one client cursor. Reconnect clears the view; it can resume at the last acknowledged revision only for the same scope. Reset asks for a snapshot. Ordered pages must be contiguous. Dispose invalidates old callbacks.
- `@harrhy/live-state/channel`: `channel(after, borrowedSink, read, arm, fail, retired)` duplicates a Cap’n Web callback for the subscription. A wake while awaiting an acknowledgment marks it dirty; the loop reads again after the acknowledgment instead of queuing every change. The caller must enforce `due` and stop the channel on disconnect or timeout. Stop releases the held callback; retirement waits for in-flight work to settle.

The Ref extraction allows async `read` so the producer can check access before each delivery. It suppresses a delivery if stopped during that check and retires once on an invalid acknowledgment. Neither module opens a transport, defines what a revision means, nor authenticates a reader. The app bounds snapshots, writes, scope and subscription lifetime.

Run `pnpm --filter @harrhy/live-state run check` from the repository root.
