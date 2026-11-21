import type { CommentBridge } from "./bridge.ts";
import type { QuoteEvidence, TargetBinding } from "./contract.ts";
import { matchesEvidence } from "./evidence.ts";
import type { ArticleSnapshot, CommentStore } from "./store.ts";

/** Owns the boundary between editable evidence and immutable, owner-sent batches. */
export function createCommentService(options: {
  store: CommentStore;
  bridge: CommentBridge;
  snapshot(articleUrl: string): ArticleSnapshot | undefined;
}) {
  const { store, bridge } = options;
  function current(evidence: QuoteEvidence): ArticleSnapshot {
    const snapshot = options.snapshot(evidence.articleUrl);
    if (!snapshot || !matchesEvidence(evidence, snapshot))
      throw new Error(
        "Article changed; review the original quote before sending",
      );
    return snapshot;
  }
  // Concurrent requests share the original operation, never create another batch.
  const pending = new Map<string, Promise<unknown>>();
  function publish(id: string): Promise<unknown> {
    const existing = pending.get(id);
    if (existing) return existing;
    const batch = store.batch(id);
    if (!batch) throw new Error("Unknown comment batch");
    const operation = (async () => {
      // A transport error is uncertainty, not proof that publication failed.
      const receipt = await bridge.publish(batch.body);
      store.rememberReceipt(id, receipt);
      return receipt;
    })().finally(() => pending.delete(id));
    pending.set(id, operation);
    return operation;
  }
  return {
    list: () =>
      store.list().map((comment) => {
        const snapshot = options.snapshot(comment.evidence.articleUrl);
        return {
          ...comment,
          current: !!snapshot && matchesEvidence(comment.evidence, snapshot),
        };
      }),
    batches: () => store.batches(),
    targets: () => bridge.targets(),
    catalog: () =>
      bridge.catalog?.() ?? bridge.targets().then((targets) => ({ targets })),
    save(evidence: QuoteEvidence, expectedRevision: number) {
      return store.save(evidence, expectedRevision, current(evidence));
    },
    remove: (id: string, revision: number) => store.remove(id, revision),
    async send(
      items: readonly { id: string; revision: number }[],
      target: TargetBinding,
    ) {
      const eligible = await bridge.targets();
      if (
        !eligible.some(
          (candidate) =>
            candidate.key === target.key &&
            candidate.revision === target.revision,
        )
      )
        throw new Error(
          "Target is no longer available; choose a current target",
        );
      const saved = store.list();
      for (const item of items) {
        const comment = saved.find(
          (candidate) => candidate.evidence.id === item.id,
        );
        if (!comment || comment.revision !== item.revision)
          throw new Error("Comment revision conflict");
        current(comment.evidence);
      }
      // All checks after the network await are synchronous through durable freeze.
      const batch = store.freeze(items, target);
      return {
        batchId: batch.body.batchId,
        receipt: await publish(batch.body.batchId),
      };
    },
    // Only an explicit owner retry publishes, using exactly the stored identity/body.
    retry: publish,
    async reconcile(id: string) {
      const batch = store.batch(id);
      if (!batch) throw new Error("Unknown comment batch");
      const receipt = await bridge.receipt(batch.body);
      store.rememberReceipt(id, receipt);
      return receipt;
    },
  };
}
