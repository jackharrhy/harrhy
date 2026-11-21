import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommentDrafts } from "../app/comments/browser-draft.ts";
import type { QuoteEvidence } from "../app/comments/contract.ts";

test("browser recovery keeps exact unsaved text and original revision, isolated by article", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const evidence: QuoteEvidence = {
    id: "draft",
    articleUrl: "https://atlas.example/spaces/alpha/note/",
    sourceSha256: "a".repeat(64),
    annotationProjectionSha256: "b".repeat(64),
    quote: { exact: "🦊", prefix: "", suffix: "", start: 0, end: 2 },
    comment: "",
  };
  const drafts = createCommentDrafts(storage, "https://atlas.example");
  drafts.remember(evidence, 3, " exact\nowner text ");
  assert.deepEqual(drafts.read(evidence.articleUrl), {
    evidence: { ...evidence, comment: " exact\nowner text " },
    revision: 3,
  });
  assert.equal(drafts.read("https://atlas.example/spaces/alpha/other/"), undefined);
  drafts.forget(evidence.articleUrl);
  assert.equal(drafts.read(evidence.articleUrl), undefined);
  drafts.remember(evidence, 3, "  ");
  assert.equal(values.size, 0);
});
