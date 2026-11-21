import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCommentBrowserApi,
  originalBatch,
  type ReviewState,
} from "../app/comments/browser-api.ts";
import type { QuoteEvidence } from "../app/comments/contract.ts";

const evidence: QuoteEvidence = {
  id: "comment",
  articleUrl: "https://atlas.example/spaces/alpha/note/",
  sourceSha256: "a".repeat(64),
  annotationProjectionSha256: "b".repeat(64),
  quote: { exact: "quote", prefix: "", suffix: "", start: 0, end: 5 },
  comment: "Explain",
};
const initial: ReviewState = {
  csrf: "c".repeat(64),
  defaultTargetKey: "d".repeat(64),
  comments: [],
  batches: [],
};

test("browser mutations require reviewed CSRF state and never automatically retry uncertain sends", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const api = createCommentBrowserApi((async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/state")) return Response.json(initial);
    throw new Error("Lost acknowledgement");
  }) as typeof fetch);
  await assert.rejects(
    api.send([{ id: evidence.id, revision: 1 }], { key: "d".repeat(64), revision: 1 }),
    /Refresh review/,
  );
  assert.equal(requests.length, 0);
  await api.state();
  await assert.rejects(
    api.send([{ id: evidence.id, revision: 1 }], { key: "d".repeat(64), revision: 1 }),
    /Lost acknowledgement/,
  );
  assert.equal(requests.length, 2);
  const send = requests[1]!;
  assert.equal(send.url, "/_atlas/comments/send");
  assert.equal(send.init?.credentials, "same-origin");
  assert.equal(send.init?.redirect, "error");
  assert.equal((send.init?.headers as Record<string, string>)["X-Atlas-CSRF"], initial.csrf);
  assert.deepEqual(JSON.parse(String(send.init?.body)), {
    items: [{ id: "comment", revision: 1 }],
    target: { key: "d".repeat(64), revision: 1 },
  });
});

test("restarted server CSRF rejection requires explicit refresh, not mutation replay", async () => {
  let calls = 0;
  const api = createCommentBrowserApi((async () => {
    calls++;
    return calls === 1
      ? Response.json(initial)
      : Response.json({ error: "Refresh the page" }, { status: 403 });
  }) as typeof fetch);
  await api.state();
  await assert.rejects(api.save(evidence, 0), /Refresh the page/);
  await assert.rejects(api.save(evidence, 0), /Refresh review/);
  assert.equal(calls, 2);
});

test("review binds original batches to exact saved revisions, not just comment IDs", () => {
  const state: ReviewState = {
    ...initial,
    batches: [
      {
        batchId: "original",
        target: { key: "d".repeat(64), revision: 1 },
        items: [{ id: evidence.id, revision: 1 }],
        comments: [evidence],
        state: "unknown",
      },
    ],
  };
  assert.equal(originalBatch(state, { evidence, revision: 1 })?.batchId, "original");
  assert.equal(originalBatch(state, { evidence, revision: 2 }), undefined);
});
