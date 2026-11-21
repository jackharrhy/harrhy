import { articleAnnotationText, annotationProjectionInput } from "../app/content/annotation.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { mkdtemp, mkdir, readdir, rm, writeFile, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";
import { openCommentStore } from "../app/comments/store.ts";
import { admittedChatUrl, createCommentBridge } from "../app/comments/bridge.ts";
import { createCommentService } from "../app/comments/service.ts";
import { createCommentHttp } from "../app/comments/http.ts";
import { loadCommentConfiguration } from "../app/comments/config.ts";
import { canonicalComments, type QuoteEvidence } from "../app/comments/contract.ts";
import { matchesEvidence, parseEvidence } from "../app/comments/evidence.ts";

const origin = "https://atlas.example";
const projection = "Before 🦊 quote after";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const evidence: QuoteEvidence = {
  id: "example-comment",
  articleUrl: `${origin}/spaces/alpha/note/`,
  sourceSha256: sha("original markdown"),
  annotationProjectionSha256: sha(projection),
  quote: { exact: "🦊 quote", prefix: "Before ", suffix: " after", start: 7, end: 15 },
  comment: "Please explain this example.",
};
const page = {
  sourceDigest: evidence.sourceSha256,
  sourceContent: "original markdown",
  annotationDigest: sha(projection),
  annotationText: projection,
};

test("comment evidence uses exact source revision and UTF-16 projection offsets", () => {
  assert.deepEqual(parseEvidence(evidence, origin), evidence);
  assert.equal(matchesEvidence(evidence, page), true);
  assert.equal(matchesEvidence(evidence, { ...page, sourceDigest: sha("edited markdown") }), false);
  assert.equal(
    matchesEvidence(evidence, { ...page, annotationDigest: sha("different projection") }),
    false,
  );
  assert.equal(
    matchesEvidence({ ...evidence, quote: { ...evidence.quote, prefix: "Other " } }, page),
    false,
  );
});

test("rejects foreign/noncanonical article URLs and unknown nested evidence fields", () => {
  for (const articleUrl of [
    "https://other.example/spaces/alpha/note/",
    `${origin}/spaces/alpha/note/?x=1`,
    `${origin}/spaces/alpha/../note/`,
    `${origin}/search/`,
  ])
    assert.throws(() => parseEvidence({ ...evidence, articleUrl }, origin));
  assert.throws(() => parseEvidence({ ...evidence, dispatch: "arbitrary" }, origin));
  assert.throws(() =>
    parseEvidence({ ...evidence, quote: { ...evidence.quote, html: "unsafe" } }, origin),
  );
  assert.throws(() =>
    parseEvidence({ ...evidence, quote: { ...evidence.quote, end: 14 } }, origin),
  );
  assert.throws(() => parseEvidence({ ...evidence, comment: "  " }, origin));
});

test("canonical batch bytes sort fields without normalizing owner text", () => {
  const canonical = canonicalComments([evidence]);
  const parsed = JSON.parse(canonical);
  assert.deepEqual(Object.keys(parsed[0]), [
    "annotationProjectionSha256",
    "articleUrl",
    "comment",
    "id",
    "quote",
    "sourceSha256",
  ]);
  assert.deepEqual(Object.keys(parsed[0].quote), ["end", "exact", "prefix", "start", "suffix"]);
  assert.deepEqual(parsed, [evidence]);
  assert.notEqual(
    sha(canonical),
    sha(canonicalComments([{ ...evidence, comment: `${evidence.comment} ` }])),
  );
});

test("SQLite stages survive restart and immutable batches survive edits/removal without retargeting", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-comments-"));
  let store = await openCommentStore(directory);
  try {
    store.save(evidence, 0, page);
    assert.throws(() => store.save(evidence, 0, page), /revision conflict/);
    store.close();
    store = await openCommentStore(directory);
    assert.deepEqual(store.list(), [{ revision: 1, evidence }]);
    const frozen = store.freeze([{ id: evidence.id, revision: 1 }], {
      key: "opaque-target",
      revision: 3,
    });
    assert.equal(frozen.receipt, null);
    assert.throws(
      () =>
        store.freeze([{ id: evidence.id, revision: 1 }], { key: "different-target", revision: 4 }),
      /already submitted/,
    );
    const edited = { ...evidence, comment: "Changed after Send" };
    store.save(edited, 1, page);
    store.remove(evidence.id, 2);
    assert.deepEqual(store.list(), []);
    assert.throws(() => store.save(evidence, 0, page), /identity cannot be reused/);
    store.rememberReceipt(frozen.body.batchId, { kind: "unknown" });
    store.close();
    store = await openCommentStore(directory);
    assert.deepEqual(store.batch(frozen.body.batchId), { ...frozen, receipt: { kind: "unknown" } });
    assert.deepEqual(store.batch(frozen.body.batchId)?.body.comments, [evidence]);
    assert.deepEqual(store.batch(frozen.body.batchId)?.body.target, {
      key: "opaque-target",
      revision: 3,
    });
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("bridge retries preserve exact batch bytes and read back original binding without browser credentials", async () => {
  const target = { key: "a".repeat(64), revision: 3 };
  const batch = {
    payloadVersion: 1 as const,
    batchId: "stable-batch",
    target,
    payloadDigest: sha(canonicalComments([evidence])),
    comments: [evidence],
  };
  const requests: { url: string; init: RequestInit }[] = [];
  const native = { kind: "unknown", evidence: "native receipt unchanged" };
  const bridge = createCommentBridge(
    { endpoint: "http://127.0.0.1:12345", token: "synthetic-app-secret-not-used-outside-tests" },
    async (url, init) => {
      requests.push({ url: String(url), init: init! });
      if (requests.length === 1) throw new Error("lost acknowledgement");
      return Response.json({
        batchId: batch.batchId,
        binding: target,
        payloadDigest: batch.payloadDigest,
        receipt: native,
      });
    },
  );
  await assert.rejects(bridge.publish(batch), /lost acknowledgement/);
  assert.deepEqual((await bridge.publish(batch)).receipt, native);
  assert.equal(requests[0]?.init.body, requests[1]?.init.body);
  assert.equal(requests[1]?.init.redirect, "error");
  assert.equal(new Headers(requests[1]?.init.headers).has("Origin"), false);
  assert.equal(new Headers(requests[1]?.init.headers).has("Cookie"), false);
  await bridge.receipt(batch);
  const query = new URL(requests[2]!.url).searchParams;
  assert.equal(query.get("revision"), "3");
  assert.equal(query.get("batchId"), "stable-batch");
  assert.throws(() =>
    createCommentBridge({ endpoint: "http://outside.example", token: "x".repeat(32) }),
  );
  const wrongReceipt = createCommentBridge(
    { endpoint: "https://bridge.example", token: "x".repeat(32) },
    async () => Response.json({ batchId: "other-batch", binding: target, receipt: native }),
  );
  await assert.rejects(wrongReceipt.publish(batch), /identity mismatch/);
});

test("owner send persists before transport and stale source cannot mint another batch", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-service-"));
  const store = await openCommentStore(directory);
  const target = { key: "a".repeat(64), revision: 1 };
  let snapshot = page;
  const published: string[] = [];
  let fail = true;
  const service = createCommentService({
    store,
    snapshot: () => snapshot,
    bridge: {
      targets: async () => [{ ...target, label: "Example", glyph: { paths: [] } }],
      publish: async (batch) => {
        assert.deepEqual(store.batch(batch.batchId)?.body, batch);
        published.push(JSON.stringify(batch));
        if (fail) throw new Error("lost acknowledgement");
        return { batchId: batch.batchId, binding: batch.target, receipt: { state: "recorded" } };
      },
      receipt: async (batch) => ({
        batchId: batch.batchId,
        binding: batch.target,
        receipt: { state: "missing" },
      }),
    },
  });
  try {
    service.save(evidence, 0);
    assert.equal(published.length, 0);
    snapshot = { ...page, sourceDigest: sha("changed") };
    await assert.rejects(
      service.send([{ id: evidence.id, revision: 1 }], target),
      /Article changed/,
    );
    assert.equal(store.batches().length, 0);
    snapshot = page;
    await assert.rejects(
      service.send([{ id: evidence.id, revision: 1 }], target),
      /lost acknowledgement/,
    );
    const batch = store.batches()[0]!;
    assert.equal(batch.receipt, null);
    snapshot = { ...page, sourceDigest: sha("changed again") };
    await service.reconcile(batch.body.batchId);
    assert.equal(published.length, 1);
    fail = false;
    await service.retry(batch.body.batchId);
    assert.equal(published[0], published[1]);
    assert.equal(store.batches().length, 1);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("HTTP comment boundary requires exact canonical origin, signed cookie and header; never exposes envelopes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-http-"));
  const store = await openCommentStore(directory);
  let publishes = 0;
  const target = { key: "b".repeat(64), revision: 2 };
  const service = createCommentService({
    store,
    snapshot: () => page,
    bridge: {
      targets: async () => [{ ...target, label: "Example", glyph: { paths: [] } }],
      publish: async (batch) => {
        publishes++;
        return {
          batchId: batch.batchId,
          binding: batch.target,
          receipt: { state: "admitted", event: { privatePath: "/secret" } },
          chatUrl: "https://pi.jackharrhy.dev/s/original-root/c/1?exact=1",
        };
      },
      receipt: async (batch) => ({
        batchId: batch.batchId,
        binding: batch.target,
        receipt: { state: "missing" },
      }),
    },
  });
  const handle = createCommentHttp(service, origin, target.key);
  try {
    const initial = await handle(new Request(`${origin}/_atlas/comments/state`));
    const { csrf } = await initial.json();
    const cookie = initial.headers.get("Set-Cookie")!.split(";")[0]!;
    assert.match(initial.headers.get("Set-Cookie")!, /HttpOnly/i);
    assert.match(initial.headers.get("Set-Cookie")!, /Secure/i);
    const body = JSON.stringify({ evidence, expectedRevision: 0 });
    const post = (suffix: string, payload: string, override: Record<string, string> = {}) =>
      handle(
        new Request(`${origin}/_atlas/comments/${suffix}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            Cookie: cookie,
            "X-Atlas-CSRF": csrf,
            ...override,
          },
          body: payload,
        }),
      );
    assert.equal((await post("save", body, { Origin: "https://foreign.example" })).status, 403);
    assert.equal((await post("save", body, { "X-Atlas-CSRF": "bad" })).status, 403);
    assert.equal((await post("save", body, { Cookie: "atlas-comments-csrf=forged" })).status, 403);
    assert.equal((await post("save", body, { "Sec-Fetch-Site": "cross-site" })).status, 403);
    assert.equal((await post("save", "x".repeat(24577))).status, 400);
    assert.equal((await post("save", body)).status, 200);
    assert.equal(publishes, 0);
    const sent = await post(
      "send",
      JSON.stringify({ items: [{ id: evidence.id, revision: 1 }], target }),
    );
    assert.equal(sent.status, 200);
    assert.equal(publishes, 1);
    assert.equal((await sent.json()).state, "admitted");
    const state = await handle(
      new Request(`${origin}/_atlas/comments/state`, { headers: { Cookie: cookie } }),
    );
    const text = await state.text();
    assert.equal(text.includes("privatePath"), false);
    assert.equal(text.includes("sourceContent"), false);
    assert.equal(text.includes("original markdown"), false);
    assert.equal(
      JSON.parse(text).batches[0].chatUrl,
      "https://pi.jackharrhy.dev/s/original-root/c/1?exact=1",
    );
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("comment configuration is explicit private opt-in and credentials reject aliases/public modes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-config-"));
  const filename = path.join(directory, "comments.json");
  const credentialFile = path.join(directory, "credential");
  const config = {
    trust: "tailnet-owner-temporary",
    articleOrigin: origin,
    stateDirectory: directory,
    bridgeEndpoint: "http://127.0.0.1:1234",
    credentialFile,
    defaultTargetKey: "a".repeat(64),
  };
  try {
    await writeFile(credentialFile, "s".repeat(64), { mode: 0o600 });
    await writeFile(filename, JSON.stringify(config), { mode: 0o600 });
    assert.equal((await loadCommentConfiguration(filename)).config.articleOrigin, origin);
    await chmod(credentialFile, 0o644);
    await assert.rejects(loadCommentConfiguration(filename));
    await chmod(credentialFile, 0o600);
    const alias = path.join(directory, "alias");
    await symlink(credentialFile, alias);
    await writeFile(filename, JSON.stringify({ ...config, credentialFile: alias }));
    await assert.rejects(loadCommentConfiguration(filename));
    for (const invalid of [
      { trust: "public" },
      { extra: true },
      { articleOrigin: `${origin}/` },
      { bridgeEndpoint: "http://foreign.example" },
    ]) {
      await writeFile(filename, JSON.stringify({ ...config, ...invalid }));
      await assert.rejects(loadCommentConfiguration(filename));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("routed comments require opt-in and stage against the current catalog without bridge access", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-comment-routes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "alpha"));
  const stateDirectory = path.join(root, "state");
  await mkdir(stateDirectory, { mode: 0o700 });
  const manifest = path.join(root, "atlas.json");
  await writeFile(
    manifest,
    JSON.stringify({ spaces: [{ id: "alpha", name: "Alpha", directory: "alpha" }] }),
  );
  const content = path.join(root, "alpha", "note.md");
  await writeFile(content, "---\ntitle: Note\npath: /note/\n---\nBefore 🦊 quote after");
  const disabled = await createAtlas(root, manifest);
  t.after(() => disabled.close());
  assert.equal((await disabled.router.fetch(`${origin}/_atlas/comments/state`)).status, 404);
  assert.deepEqual(await readdir(stateDirectory), []);
  const credentialFile = path.join(root, "credential");
  await writeFile(credentialFile, "private-test-credential-".repeat(2), { mode: 0o600 });
  const configuration = path.join(root, "comments.json");
  await writeFile(
    configuration,
    JSON.stringify({
      trust: "tailnet-owner-temporary",
      articleOrigin: origin,
      stateDirectory,
      bridgeEndpoint: "http://127.0.0.1:1",
      credentialFile,
      defaultTargetKey: "a".repeat(64),
    }),
    { mode: 0o600 },
  );
  const atlas = await createAtlas(root, manifest, undefined, configuration);
  t.after(() => atlas.close());
  const response = await atlas.router.fetch(`${origin}/_atlas/comments/state`);
  assert.equal(response.status, 200);
  const state = await response.json();
  const cookie = response.headers.get("Set-Cookie")!.split(";")[0]!;
  const snapshot = atlas.catalog.read().generation!.pages["/spaces/alpha/note"]!;
  const currentEvidence = {
    ...evidence,
    sourceSha256: snapshot.sourceDigest,
    annotationProjectionSha256: snapshot.annotationDigest,
    quote: {
      ...evidence.quote,
      start: snapshot.annotationText.indexOf(evidence.quote.exact),
      end: snapshot.annotationText.indexOf(evidence.quote.exact) + evidence.quote.exact.length,
      prefix: snapshot.annotationText.slice(
        0,
        snapshot.annotationText.indexOf(evidence.quote.exact),
      ),
      suffix: snapshot.annotationText.slice(
        snapshot.annotationText.indexOf(evidence.quote.exact) + evidence.quote.exact.length,
      ),
    },
  };
  const save = () =>
    atlas.router.fetch(
      new Request(`${origin}/_atlas/comments/save`, {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-Atlas-CSRF": state.csrf,
        },
        body: JSON.stringify({ evidence: currentEvidence, expectedRevision: 0 }),
      }),
    );
  const articleResponse = await atlas.router.fetch(`${origin}/spaces/alpha/note/`);
  const html = await articleResponse.text();
  assert.match(html, /data-atlas-article/);
  assert.match(html, /data-source-sha256="[a-f0-9]{64}"/);
  assert.ok(!html.includes("sourceContent"));
  assert.ok(!html.includes("---\\ntitle: Note"));
  const assetUrl = html.match(/src="(\/_atlas\/comment-assets\/[a-f0-9]{64}\.js)"/)?.[1];
  assert.ok(assetUrl);
  const asset = await atlas.router.fetch(`${origin}${assetUrl}`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("Cache-Control")!, /immutable/);
  const script = await asset.text();
  assert.match(script, /Hypothes\.is Project and contributors/);
  assert.match(script, /Copyright 2012 Aron Carroll/);
  assert.ok(assetUrl.includes(sha(script)), "asset hash includes distributed license notices");
  assert.equal((await disabled.router.fetch(`${origin}${assetUrl}`)).status, 404);
  assert.match(articleResponse.headers.get("Content-Security-Policy")!, /connect-src 'self'/);
  assert.equal((await save()).status, 200, "staging succeeds with no reachable bridge");
  const saved = await (await atlas.router.fetch(`${origin}/_atlas/comments/state`)).json();
  assert.equal(saved.comments.length, 1);
  assert.equal(saved.batches.length, 0);
  assert.ok(!JSON.stringify(saved).includes("---\ntitle"));
  await writeFile(content, "---\ntitle: Note\npath: /note/\n---\nChanged article");
  await atlas.catalog.refresh();
  assert.equal(
    (await save()).status,
    503,
    "old source evidence cannot be saved to changed content",
  );
});

test("recipient catalog preserves session identity and validates additive metadata", async () => {
  const target = {
    key: "a".repeat(64),
    revision: 1,
    label: "Actual root title",
    sessionId: "root-one",
    glyph: { paths: [] },
  };
  let dto: unknown = {
    targets: [target],
    defaultSessionId: "root-one",
    eligibleCount: 1,
    omittedPrivacyCount: 2,
    unavailable: [{ sessionId: "root-two", label: "Stopped root", reason: "not-writable" }],
  };
  const bridge = createCommentBridge(
    { endpoint: "http://127.0.0.1:1", token: "s".repeat(64) },
    async () => Response.json(dto),
  );
  assert.deepEqual(await bridge.catalog!(), dto);
  assert.deepEqual(await bridge.targets(), [target]);
  dto = { targets: [{ ...target, key: [target.key] }] };
  await assert.rejects(bridge.catalog!(), /Invalid comment target/);
  dto = { targets: [{ ...target, glyph: { paths: [{ fill: ["#abcdef"], d: "M0 0" }] } }] };
  await assert.rejects(bridge.catalog!(), /Invalid comment target glyph/);
  dto = { targets: [target], eligibleCount: 2 };
  await assert.rejects(bridge.catalog!(), /Incomplete/);
  dto = { targets: [target, target] };
  await assert.rejects(bridge.catalog!(), /Duplicate/);
});

test("title projection v2 leaves saved v1 evidence and original batches immutable", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-projection-upgrade-"));
  const store = await openCommentStore(directory);
  try {
    store.save(evidence, 0, page);
    const frozen = store.freeze([{ id: evidence.id, revision: 1 }], {
      key: "a".repeat(64),
      revision: 1,
    });
    const annotationText = articleAnnotationText("Title 🦊\r\nMore\0", projection);
    assert.equal(annotationText, "Title 🦊\nMore�\n" + projection);
    assert.notEqual(sha(annotationProjectionInput(annotationText)), sha(annotationText));
    const snapshot = {
      ...page,
      annotationText,
      annotationDigest: sha(annotationProjectionInput(annotationText)),
    };
    const service = createCommentService({
      store,
      snapshot: () => snapshot,
      bridge: {
        targets: async () => [
          { key: "a".repeat(64), revision: 1, label: "Root", glyph: { paths: [] } },
        ],
        publish: async () => {
          throw Error("must not publish");
        },
        receipt: async () => {
          throw Error("must not read receipt");
        },
      },
    });
    assert.equal(service.list()[0].current, false);
    assert.deepEqual(store.list(), [{ evidence, revision: 1 }]);
    assert.deepEqual(store.batch(frozen.body.batchId), frozen);
    await assert.rejects(
      service.send([{ id: evidence.id, revision: 1 }], frozen.body.target),
      /Article changed/,
    );
    assert.deepEqual(store.batch(frozen.body.batchId), frozen);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("CSRF signing survives server recreation but rejects credential rotation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-csrf-stable-"));
  const store = await openCommentStore(directory);
  try {
    const service = createCommentService({
      store,
      snapshot: () => page,
      bridge: {
        targets: async () => [],
        publish: async () => {
          throw Error("no publication");
        },
        receipt: async () => {
          throw Error("no receipt");
        },
      },
    });
    const stableSecret = "k".repeat(64);
    const first = createCommentHttp(service, origin, "a".repeat(64), stableSecret);
    const state = await first(new Request(origin + "/_atlas/comments/state"));
    const cookie = state.headers.get("Set-Cookie")!.split(";")[0];
    const { csrf } = await state.json();
    const request = () =>
      new Request(origin + "/_atlas/comments/save", {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-Atlas-CSRF": csrf,
        },
        body: JSON.stringify({ evidence, expectedRevision: 0 }),
      });
    const restarted = createCommentHttp(service, origin, "a".repeat(64), stableSecret);
    assert.equal((await restarted(request())).status, 200);
    const rotated = createCommentHttp(service, origin, "a".repeat(64), "r".repeat(64));
    assert.equal((await rotated(request())).status, 403);
    assert.deepEqual(store.list(), [{ evidence, revision: 1 }]);
    assert.deepEqual(store.batches(), []);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("chat links require original native admission and the trusted Pi origin", () => {
  const chatUrl = "https://pi.jackharrhy.dev/s/original/c/1?exact=1";
  const admitted = { receipt: { state: "admitted" }, chatUrl };
  assert.equal(admittedChatUrl(admitted), chatUrl);
  for (const state of ["recorded", "missing", "unknown"]) {
    assert.equal(admittedChatUrl({ ...admitted, receipt: { state } }), undefined);
  }
  for (const url of [
    "https://evil.example/s/root/c/1",
    "//pi.jackharrhy.dev/s/root",
    "javascript:alert(1)",
    "https://user@pi.jackharrhy.dev/s/root",
    "https://pi.jackharrhy.dev/not-chat",
  ]) {
    assert.equal(admittedChatUrl({ ...admitted, chatUrl: url }), undefined);
  }
});
