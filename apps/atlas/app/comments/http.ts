import { randomBytes } from "node:crypto";
import { createCookie } from "remix/cookie";
import { admittedChatUrl } from "./bridge.ts";
import { parseEvidence } from "./evidence.ts";
import type { createCommentService } from "./service.ts";

type Service = ReturnType<typeof createCommentService>;
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error("Invalid request fields");
  return value as Record<string, unknown>;
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("Invalid revision");
  return value as number;
}
function identity(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 128)
    throw new Error("Invalid identity");
  return value;
}
// Keep native private envelopes server-side; the browser sees only factual state.
function receiptState(value: unknown): string {
  const state = (value as { receipt?: { state?: unknown } } | null)?.receipt?.state;
  return typeof state === "string" && ["missing", "recorded", "unknown", "admitted"].includes(state)
    ? state
    : "unknown";
}
export function createCommentHttp(
  service: Service,
  articleOrigin: string,
  defaultTargetKey: string,
  csrfSecret = randomBytes(32).toString("hex"),
) {
  const cookie = createCookie("atlas-comments-csrf", {
    secrets: [csrfSecret],
    httpOnly: true,
    secure: new URL(articleOrigin).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 86400,
  });
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
  return async function handle(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    const origin = request.headers.get("Origin");
    const site = request.headers.get("Sec-Fetch-Site");
    if (
      (origin !== null && origin !== articleOrigin) ||
      (site !== null && !["same-origin", "none"].includes(site))
    )
      return json({ error: "Same-origin requests only" }, 403);
    let token: unknown;
    try {
      token = await cookie.parse(request.headers.get("Cookie"));
    } catch {
      token = null;
    }
    if (request.method === "GET" && pathname === "/_atlas/comments/state") {
      const csrf =
        typeof token === "string" && /^[0-9a-f]{64}$/.test(token)
          ? token
          : randomBytes(32).toString("hex");
      const response = json({
        csrf,
        defaultTargetKey,
        comments: service.list(),
        batches: service.batches().map(({ body, items, receipt }) => ({
          batchId: body.batchId,
          target: body.target,
          items,
          comments: body.comments,
          state: receiptState(receipt),
          ...(admittedChatUrl(receipt) ? { chatUrl: admittedChatUrl(receipt) } : {}),
        })),
      });
      response.headers.set("Set-Cookie", await cookie.serialize(csrf));
      return response;
    }
    if (request.method === "GET" && pathname === "/_atlas/comments/targets") {
      try {
        return json(await service.catalog());
      } catch {
        return json({ error: "Agent targets unavailable" }, 503);
      }
    }
    if (request.method !== "POST") return json({ error: "Not found" }, 404);
    if (
      origin !== articleOrigin ||
      typeof token !== "string" ||
      !/^[0-9a-f]{64}$/.test(token) ||
      request.headers.get("X-Atlas-CSRF") !== token
    )
      return json({ error: "Page changed. Refresh." }, 403);
    if (request.headers.get("Content-Type") !== "application/json")
      return json({ error: "JSON required" }, 415);
    let data: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) throw new Error("Missing body");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 24576) throw new Error("Request exceeds limit");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
      data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      return json({ error: "Invalid bounded JSON request" }, 400);
    }
    try {
      if (pathname === "/_atlas/comments/save") {
        const item = object(data, ["evidence", "expectedRevision"]);
        return json(
          service.save(
            parseEvidence(item.evidence, articleOrigin),
            revision(item.expectedRevision),
          ),
        );
      }
      if (pathname === "/_atlas/comments/remove") {
        const item = object(data, ["id", "revision"]);
        service.remove(identity(item.id), revision(item.revision));
        return json({ removed: true });
      }
      if (pathname === "/_atlas/comments/send") {
        const item = object(data, ["items", "target"]);
        const target = object(item.target, ["key", "revision"]);
        if (
          typeof target.key !== "string" ||
          !/^[0-9a-f]{64}$/.test(target.key) ||
          !Array.isArray(item.items) ||
          item.items.length > 32
        )
          throw new Error("Invalid batch");
        const items = item.items.map((entry) => {
          const value = object(entry, ["id", "revision"]);
          return { id: identity(value.id), revision: revision(value.revision) };
        });
        const result = await service.send(items, {
          key: target.key,
          revision: revision(target.revision),
        });
        return json({
          batchId: result.batchId,
          state: receiptState(result.receipt),
          ...(admittedChatUrl(result.receipt) ? { chatUrl: admittedChatUrl(result.receipt) } : {}),
        });
      }
      if (pathname === "/_atlas/comments/retry" || pathname === "/_atlas/comments/receipt") {
        const item = object(data, ["batchId"]);
        const id = identity(item.batchId);
        const receipt = pathname.endsWith("/retry")
          ? await service.retry(id)
          : await service.reconcile(id);
        return json({
          batchId: id,
          state: receiptState(receipt),
          ...(admittedChatUrl(receipt) ? { chatUrl: admittedChatUrl(receipt) } : {}),
        });
      }
      return json({ error: "Not found" }, 404);
    } catch {
      // Do not leak filesystem, credential, bridge response or private target details.
      // State readback exposes any already-frozen batch after a lost acknowledgement.
      return json(
        {
          error: "Couldn’t save changes. Refresh and try again.",
        },
        503,
      );
    }
  };
}
