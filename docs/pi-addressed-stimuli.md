# Addressed Pi stimuli (proposal)

Keep native stimuli as the dispatch path for local senders, Atlas, and remote Pi peers. Adapters authenticate and authorize; they do not own another delivery queue. Familiar is the default only when omitted and allowed. Discover eligible IDs and titles without provisioning subscriptions or starting workers. Never redirect a denied explicit address to the default.

## Core delivery slice

For newly addressed events, record one immutable intent per authenticated peer namespace and caller event ID in the existing stimuli store. The intent stores the original selector, payload digest, resolved session and conversation, and policy revision. An identical retry recovers the existing intent without resolving a new destination; changing the selector or payload conflicts. The worker commits input and admission receipt together. An admission receipt is neither a final answer nor proof of business success.

Keep historical receipt reads independently scoped from new sends. Check authoritative sharing, archive, and writable-conversation state through native admission where privacy is required. Withdrawal stops unattempted work; reconcile uncertain work with its original target. Later owner sharing can expose previously admitted messages.

## Adapter order and cutover

1. Qualify addressed recording and readback: race competing targets under one ID, lose the acknowledgement across restart, change the default/main, race sharing and archive, and check readback after send permission is withdrawn.
2. Use the optional [Pi Inbox](pi-inbox.md) for new explicitly requested local sends. Preserve legacy receipts and reconcile or quarantine outstanding IDs on their original path. Never treat a legacy timeout or missing receipt as permission to publish in the new namespace.
3. Preserve Atlas frozen batches and verify the website authorization boundary. Replies are explicit messages to the original authorized feedback thread, not automatic publication of agent answers.
4. Qualify the revised remote Pi adapter on disposable instances. Both ends expose policy-filtered destinations; both can explicitly send. Keep the SSH transport restricted and directional, and constrain receiving-session tools and outbound traffic independently of sender attribution.

This proposal does not enable a bridge, alter existing integrations, or authorize a live cutover. The earlier fixed-inbox prototype is not the implementation of this design.
