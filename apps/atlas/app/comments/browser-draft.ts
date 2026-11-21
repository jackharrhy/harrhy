import type { QuoteEvidence } from "./contract.ts";
import { parseEvidence } from "./evidence.ts";

export interface RecoverableDraft {
  readonly evidence: QuoteEvidence;
  readonly revision: number;
}
const key = (articleUrl: string) => `atlas-comment-draft:${articleUrl}`;

/** Recovery text is not staged evidence and never triggers a server mutation. */
export function createCommentDrafts(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  origin: string,
) {
  return {
    read(articleUrl: string): RecoverableDraft | undefined {
      const raw = storage.getItem(key(articleUrl));
      if (!raw) return;
      const value = JSON.parse(raw);
      if (!Number.isSafeInteger(value.revision) || value.revision < 0)
        throw new Error("Invalid draft revision");
      const evidence = parseEvidence(value.evidence, origin);
      if (evidence.articleUrl !== articleUrl)
        throw new Error("Draft belongs to another article");
      return { evidence, revision: value.revision };
    },
    remember(evidence: QuoteEvidence, revision: number, text: string) {
      if (!text.trim()) {
        storage.removeItem(key(evidence.articleUrl));
        return;
      }
      storage.setItem(
        key(evidence.articleUrl),
        JSON.stringify({ evidence: { ...evidence, comment: text }, revision }),
      );
    },
    forget(articleUrl: string) {
      storage.removeItem(key(articleUrl));
    },
  };
}
