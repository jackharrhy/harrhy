import { currentLog } from "@harrhy/logger";
import type { AppRuntimeService } from "./runtime.ts";
import { imageType, MAX_UPLOAD_BYTES } from "./image-upload.ts";
import {
  cachePreviewImage,
  isGenericSocialPreview,
  normalizeLinkUrl,
  previewLink,
} from "./link-preview.ts";

export type BoardResourceResult<T> =
  | { ok: true; value: T; status: number }
  | { ok: false; message: string; status: number };

type BoardService = ReturnType<AppRuntimeService["board"]>;
type SavedLink = NonNullable<Awaited<ReturnType<BoardService["existingLink"]>>>;
type RefreshedLink = NonNullable<
  Awaited<ReturnType<BoardService["refreshLink"]>>
>;

// Callers authorize access and confirm the board exists before writing resources.
export async function uploadBoardImage(
  runtime: AppRuntimeService,
  boardId: string,
  file: File,
): Promise<
  BoardResourceResult<{ assetId: string; filename: string; url: string }>
> {
  const log = currentLog();
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > MAX_UPLOAD_BYTES
  )
    return { ok: false, message: "Image must be 20 MB or less", status: 413 };
  const type = await imageType(file, MAX_UPLOAD_BYTES);
  if (!type)
    return {
      ok: false,
      message: "PNG, JPEG, GIF, or WebP required",
      status: 415,
    };
  const assetId = crypto.randomUUID();
  log?.set({
    "resource.assetId": assetId,
    "upload.bytes": file.size,
    "asset.content_type": type,
  });
  const objectKey = `boards/${boardId}/${assetId}`;
  await runtime.media.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: type },
  });
  const filename = file.name.slice(0, 160) || "Image";
  try {
    await runtime.board(boardId).recordAsset(boardId, {
      id: assetId,
      objectKey,
      filename,
      contentType: type,
      size: file.size,
    });
  } catch (error) {
    await runtime.media.delete(objectKey);
    throw error;
  }
  return {
    ok: true,
    value: { assetId, filename, url: `/media/${boardId}/${assetId}` },
    status: 201,
  };
}

export async function saveBoardLink(
  runtime: AppRuntimeService,
  boardId: string,
  inputUrl: string,
  refresh = false,
): Promise<BoardResourceResult<SavedLink | RefreshedLink>> {
  const log = currentLog();
  const url = normalizeLinkUrl(inputUrl);
  if (!url)
    return { ok: false, message: "Enter a public web URL", status: 400 };
  log?.set({
    "link.host": new URL(url).hostname,
    "link.refresh": refresh,
  });
  const board = runtime.board(boardId);
  const existing = await board.existingLink(boardId, url);
  log?.set({ "link.existing": !!existing });
  if (existing && !refresh) return { ok: true, value: existing, status: 200 };
  if (refresh && !existing)
    return {
      ok: false,
      message: "Link is no longer on this board",
      status: 404,
    };
  const fetched = await (log?.time("preview.fetch", () => previewLink(url)) ??
    previewLink(url));
  if (
    refresh &&
    ((!fetched.imageUrl && !fetched.videoUrl) ||
      isGenericSocialPreview(fetched))
  )
    return {
      ok: false,
      message: "The post did not provide a usable preview yet",
      status: 422,
    };
  const preview = await (log?.time("preview.cache", () =>
    cachePreviewImage(fetched, runtime.media, boardId),
  ) ?? cachePreviewImage(fetched, runtime.media, boardId));
  log?.set({
    "preview.cached": !!preview.imageUrl?.startsWith(`/previews/${boardId}/`),
  });
  if (
    refresh &&
    !preview.videoUrl &&
    !preview.imageUrl?.startsWith(`/previews/${boardId}/`)
  )
    return {
      ok: false,
      message: "Could not cache the new preview image",
      status: 502,
    };
  if (existing) {
    const updated = await board.refreshLink(boardId, existing.assetId, preview);
    return updated
      ? { ok: true, value: updated, status: 200 }
      : { ok: false, message: "Link is no longer on this board", status: 404 };
  }
  const saved = await board.recordLink(boardId, preview);
  return { ok: true, value: saved, status: 201 };
}
