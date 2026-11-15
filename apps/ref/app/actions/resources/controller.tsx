import { createController } from "remix/router";
import {
  AppRuntime,
  Authenticated,
  CurrentSessionToken,
} from "../../data/runtime.ts";
import { tokenHash } from "../../data/crypto.ts";
import { saveBoardLink, uploadBoardImage } from "../../data/board-resources.ts";
import { MAX_UPLOAD_BYTES } from "../../data/image-upload.ts";
import type { AppContext } from "../../router.ts";
import { routes } from "../../routes.ts";

export default createController(routes.resources, {
  actions: {
    async snapshot(context) {
      const access = await boardAccess(context);
      if (!access) return new Response("Not found", { status: 404 });
      const snapshot = await context
        .get(AppRuntime)!
        .board(context.params.boardId)
        .snapshot(context.params.boardId);
      return Response.json(snapshot, {
        headers: { "Cache-Control": "private, no-store" },
      });
    },
    async websocket(context) {
      const access = await boardAccess(context);
      if (!access) return new Response("Not found", { status: 404 });
      const token = context.get(CurrentSessionToken);
      if (!token) return new Response("Unauthorized", { status: 401 });
      const headers = new Headers(context.request.headers);
      headers.set("x-ref-board", context.params.boardId);
      headers.set("x-ref-session-hash", await tokenHash(token));
      return context
        .get(AppRuntime)!
        .board(context.params.boardId)
        .fetch(new Request(context.request.url, { headers }));
    },
    async upload(context) {
      const access = await boardAccess(context);
      if (!access) return new Response("Forbidden", { status: 403 });
      const length = Number(context.request.headers.get("Content-Length"));
      if (length > MAX_UPLOAD_BYTES + 100_000)
        return new Response("Image too large", { status: 413 });
      const form = context.get(FormData)!;
      const file = form.get("file");
      if (!(file instanceof File))
        return new Response("Image must be 20 MB or less", { status: 413 });
      const result = await uploadBoardImage(
        context.get(AppRuntime)!,
        context.params.boardId,
        file,
      );
      return result.ok
        ? Response.json(result.value, { status: result.status })
        : new Response(result.message, { status: result.status });
    },
    async link(context) {
      if (!(await boardAccess(context)))
        return new Response("Forbidden", { status: 403 });
      const form = context.get(FormData)!;
      const result = await saveBoardLink(
        context.get(AppRuntime)!,
        context.params.boardId,
        String(form.get("url") ?? ""),
        form.get("refresh") === "1",
      );
      return result.ok
        ? Response.json(result.value, { status: result.status })
        : new Response(result.message, { status: result.status });
    },
    async preview(context) {
      if (!(await boardAccess(context)))
        return new Response("Not found", { status: 404 });
      const hash = context.params.imageId;
      if (!/^[0-9a-f]{64}$/.test(hash))
        return new Response("Not found", { status: 404 });
      const object = await context
        .get(AppRuntime)!
        .media.get(`boards/${context.params.boardId}/previews/${hash}`);
      if (!object) return new Response("Not found", { status: 404 });
      return privateImageResponse(
        context.request,
        object,
        object.httpMetadata?.contentType ?? "application/octet-stream",
      );
    },
    async media(context) {
      const access = await boardAccess(context);
      if (!access) return new Response("Not found", { status: 404 });
      const runtime = context.get(AppRuntime)!;
      const asset = await runtime
        .board(context.params.boardId)
        .asset(context.params.boardId, context.params.assetId);
      if (!asset) return new Response("Not found", { status: 404 });
      const object = await runtime.media.get(asset.objectKey);
      if (!object) return new Response("Not found", { status: 404 });
      return privateImageResponse(context.request, object, asset.contentType);
    },
  },
});

async function privateImageResponse(
  request: Request,
  object: R2ObjectBody,
  contentType: string,
): Promise<Response> {
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, no-cache",
    "Content-Security-Policy": "default-src none; sandbox",
    ETag: object.httpEtag,
  });
  if (request.headers.get("If-None-Match") === object.httpEtag) {
    await object.body.cancel().catch(() => undefined);
    return new Response(null, { status: 304, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}

async function boardAccess(
  context: AppContext & { params: { boardId: string } },
) {
  if (!context.get(Authenticated)) return null;
  return context.get(AppRuntime)!.directory.board(context.params.boardId);
}
