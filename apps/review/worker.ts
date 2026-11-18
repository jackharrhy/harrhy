import { createRouter } from "remix/router";
import { readRequestBody } from "@harrhy/request-body";
import { ReviewCell, error } from "./cell.ts";
import { page } from "./page.tsx";
import { normalizeTitle, titleError } from "./title.ts";

export { ReviewCell };
const limit = 512 * 1024;
const utf8 = new TextEncoder();
const idPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/;
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const note = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim() && value.length <= 2000;

async function json(request: Request, maxBytes: number) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return error(415, "Expected application/json");
  const body = await readRequestBody(request, { maxBytes, timeoutMs: 5000 });
  if (!body.ok)
    return error(
      body.error === "too_large" ? 413 : 400,
      "Missing, unreadable or oversized request body",
    );
  try {
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes));
    if (data && typeof data === "object" && !Array.isArray(data))
      return data as Record<string, unknown>;
  } catch {}
  return error(400, "Expected a JSON object");
}

type CellRpc = {
  [
    K in "list" | "get" | "threads" | "exists" | "submit" | "rename" | "remove" | "add" | "update"
  ]: (...args: Parameters<ReviewCell[K]>) => Promise<ReturnType<ReviewCell[K]>>;
};
function routerFor(env: Env) {
  const router = createRouter();
  const namespace = env.REVIEWS;
  const cell = () => namespace.get(namespace.idFromName("inbox")) as unknown as CellRpc;
  router.get("/", ({ request }) => page(request));
  router.get("/reviews/:id", async ({ request, params }) =>
    idPattern.test(params.id) && (await cell().exists(params.id))
      ? page(request)
      : error(404, "Review not found"),
  );
  router.get("/api/reviews", async () => Response.json(await cell().list()));
  router.get("/api/reviews/:id", async ({ params }) => {
    const result = idPattern.test(params.id) && (await cell().get(params.id));
    return result ? Response.json(result) : error(404, "Review not found");
  });
  router.get("/api/reviews/:id/threads", async ({ params }) => {
    const result = idPattern.test(params.id) && (await cell().threads(params.id));
    return result ? Response.json(result) : error(404, "Review not found");
  });
  router.post("/api/reviews", async ({ request }) => {
    const data = await json(request, 4 * limit);
    if (data instanceof Response) return data;
    const { base, head, mergeBase, patch } = data;
    if (
      !sha(base) ||
      !sha(head) ||
      !sha(mergeBase) ||
      typeof patch !== "string" ||
      !patch.startsWith("diff --git ")
    )
      return error(400, "Expected commit IDs and a Git patch");
    if (utf8.encode(patch).length > limit) return error(413, "Patch exceeds 512 KiB");
    const title = normalizeTitle(data.title);
    if (data.title !== undefined && title === null) return error(400, titleError);
    return cell().submit({ base, head, mergeBase, patch }, env.HARRHY_REVIEW_ORIGIN, title);
  });
  router.patch("/api/reviews/:id", async ({ params, request }) => {
    if (!idPattern.test(params.id)) return error(404, "Review not found");
    const data = await json(request, 4096);
    if (data instanceof Response) return data;
    const title = normalizeTitle(data.title);
    return title === null ? error(400, titleError) : cell().rename(params.id, title);
  });
  router.delete("/api/reviews/:id", ({ params }) =>
    idPattern.test(params.id) ? cell().remove(params.id) : error(404, "Review not found"),
  );
  router.post("/api/reviews/:id/threads", async ({ request, params }) => {
    if (!idPattern.test(params.id)) return error(404, "Review not found");
    const data = await json(request, 16 * 1024);
    if (data instanceof Response) return data;
    const { file, side, line, text } = data;
    if (
      typeof file !== "number" ||
      !Number.isSafeInteger(file) ||
      file < 0 ||
      (side !== "old" && side !== "new") ||
      typeof line !== "number" ||
      !Number.isSafeInteger(line) ||
      line < 1 ||
      !note(text)
    )
      return error(400, "Expected file index, old/new side, line and note (up to 2000 characters)");
    return cell().add(params.id, { file, side, line }, text.trim());
  });
  router.post("/api/reviews/:id/threads/:tid", async ({ request, params }) => {
    if (!idPattern.test(params.id) || !idPattern.test(params.tid))
      return error(404, "Thread not found");
    const data = await json(request, 16 * 1024);
    if (data instanceof Response) return data;
    const { action, text } = data;
    if (action === "reply" && note(text))
      return cell().update(params.id, params.tid, {
        action,
        text: text.trim(),
      });
    if (action === "resolve" || action === "reopen")
      return cell().update(params.id, params.tid, { action });
    return error(400, "Expected reply with a note, resolve, or reopen");
  });
  router.get("/browser.js", ({ request }) => env.ASSETS.fetch(request));
  return router;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const origin = env.HARRHY_REVIEW_ORIGIN;
    const suppliedOrigin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    let response;
    if (
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
      url.origin !== origin ||
      request.headers.get("host") !== url.host ||
      (suppliedOrigin !== null && suppliedOrigin !== origin) ||
      (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none")
    ) {
      response = error(403, "Only local same-origin requests are accepted");
    } else if (request.method !== "GET" && request.headers.get("x-harrhy-review") !== "1") {
      response = error(403, "Missing review mutation header");
    } else {
      response = await routerFor(env).fetch(request);
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'unsafe-inline' 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<Env>;
