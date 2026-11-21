import { downloadExport } from "../../data/export-download.ts";
import { isUuid } from "../../data/protocol.ts";
import { currentLog } from "@harrhy/logger";
import { createController } from "remix/router";
import { AppRuntime, ArchiveSubject } from "../../data/runtime.ts";
import {
  HASH_PATTERN,
  parseArchivedPreview,
  parseBoardRecord,
} from "../../data/archive.ts";
import {
  imageType,
  MAX_PREVIEW_BYTES,
  MAX_UPLOAD_BYTES,
} from "../../data/image-upload.ts";
import type { AppContext } from "../../router.ts";
import { routes } from "../../routes.ts";

export default createController(routes.archive, {
  actions: {
    async startExport(context) {
      const subject = context.get(ArchiveSubject);
      if (!subject) return new Response("Forbidden", { status: 403 });
      const job = await context.get(AppRuntime)!.exports.start(subject);
      return job
        ? Response.json(job, { status: job.state === "building" ? 202 : 200 })
        : new Response("Export unavailable. Try again later.", { status: 503 });
    },
    async exportStatus(context) {
      const subject = context.get(ArchiveSubject);
      if (!subject) return new Response("Forbidden", { status: 403 });
      const job = await context
        .get(AppRuntime)!
        .exports.status(subject, context.params.id);
      return job
        ? Response.json(job)
        : new Response("Export not found", { status: 404 });
    },
    async downloadExport(context) {
      const subject = context.get(ArchiveSubject);
      if (!subject) return new Response("Forbidden", { status: 403 });
      return downloadExport(
        context.get(AppRuntime)!.exports,
        subject,
        context.params.id,
      );
    },
    async boards(context) {
      const log = currentLog();
      if (!context.get(ArchiveSubject))
        return new Response("Forbidden", { status: 403 });
      const boards = await context.get(AppRuntime)!.directory.listBoards();
      log?.set({ "boards.count": boards.length });
      return Response.json(boards, {
        headers: { "Cache-Control": "private, no-store" },
      });
    },
    async restoreBoard(context) {
      const log = currentLog();
      if (!context.get(ArchiveSubject))
        return new Response("Forbidden", { status: 403 });
      const record = parseJsonField(context.get(FormData)!, "record", 4096);
      const board = parseBoardRecord(record);
      if (!board) return new Response("Invalid board", { status: 400 });
      const runtime = context.get(AppRuntime)!;
      if (!(await runtime.directory.restoreBoard(board)))
        return new Response("Board conflicts with backup", { status: 409 });
      log?.set({ "resource.boardId": board.id });
      await runtime.board(board.id).initialize(board.id);
      return Response.json(board);
    },
    async restoreAsset(context) {
      if (!(await boardAccess(context)))
        return new Response("Forbidden", { status: 403 });
      const { boardId, assetId } = context.params;
      if (!isUuid(assetId))
        return new Response("Invalid asset ID", { status: 400 });
      const file = context.get(FormData)!.get("file");
      if (!(file instanceof File) || file.name.length > 160)
        return new Response("Invalid image", { status: 400 });
      const type = await imageType(file, MAX_UPLOAD_BYTES);
      if (!type) return new Response("Invalid image", { status: 415 });
      const runtime = context.get(AppRuntime)!;
      const objectKey = `boards/${boardId}/${assetId}`;
      const saved = await runtime.board(boardId).restoreAsset(boardId, {
        id: assetId,
        objectKey,
        filename: file.name,
        contentType: type,
        size: file.size,
      });
      if (!saved) return new Response("Asset conflict", { status: 409 });
      if (!(await runtime.media.head(objectKey)))
        await runtime.media.put(objectKey, await file.arrayBuffer(), {
          httpMetadata: { contentType: type },
        });
      return new Response(null, { status: 204 });
    },
    async restorePreview(context) {
      if (!(await boardAccess(context)))
        return new Response("Forbidden", { status: 403 });
      const { boardId, imageId } = context.params;
      if (!HASH_PATTERN.test(imageId))
        return new Response("Invalid preview ID", { status: 400 });
      const file = context.get(FormData)!.get("file");
      if (!(file instanceof File))
        return new Response("Invalid image", { status: 400 });
      const type = await imageType(file, MAX_PREVIEW_BYTES);
      if (!type) return new Response("Invalid image", { status: 415 });
      await context
        .get(AppRuntime)!
        .board(boardId)
        .restorePreview(boardId, imageId, await file.arrayBuffer(), type);
      return new Response(null, { status: 204 });
    },
    async restoreLink(context) {
      if (!(await boardAccess(context)))
        return new Response("Forbidden", { status: 403 });
      const { boardId, assetId } = context.params;
      if (!isUuid(assetId))
        return new Response("Invalid asset ID", { status: 400 });
      const input = parseJsonField(context.get(FormData)!, "preview", 4096);
      const preview = parseArchivedPreview(input, boardId);
      if (!preview) return new Response("Invalid link", { status: 400 });
      const saved = await context
        .get(AppRuntime)!
        .board(boardId)
        .restoreLink(boardId, assetId, preview);
      return saved
        ? new Response(null, { status: 204 })
        : new Response("Link conflict", { status: 409 });
    },
    async restoreItem(context) {
      if (!(await boardAccess(context)))
        return new Response("Forbidden", { status: 403 });
      const operation = parseJsonField(
        context.get(FormData)!,
        "operation",
        4096,
      );
      if (!operation) return new Response("Invalid item", { status: 400 });
      const saved = await context
        .get(AppRuntime)!
        .board(context.params.boardId)
        .restoreItem(context.params.boardId, operation);
      return saved
        ? new Response(null, { status: 204 })
        : new Response("Item conflict", { status: 409 });
    },
  },
});

function parseJsonField(form: FormData, key: string, limit: number): unknown {
  const text = form.get(key);
  if (typeof text !== "string" || text.length > limit) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function boardAccess(
  context: AppContext & { params: { boardId: string } },
) {
  if (!context.get(ArchiveSubject) || !isUuid(context.params.boardId))
    return null;
  return context.get(AppRuntime)!.directory.board(context.params.boardId);
}
