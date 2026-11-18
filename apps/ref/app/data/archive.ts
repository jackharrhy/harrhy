import type { BoardRecord } from "./directory-cell.ts";
import { isRecord, isUuid, type LinkPreview } from "./protocol.ts";
import { normalizeLinkUrl, normalizeXVideoUrl } from "./link-preview.ts";

export const HASH_PATTERN = /^[0-9a-f]{64}$/;

export function parseBoardRecord(value: unknown): BoardRecord | null {
  if (!isRecord(value)) return null;
  const { id, title, createdAt, updatedAt } = value;
  if (
    !isUuid(id) ||
    typeof title !== "string" ||
    title.trim() !== title ||
    title.length < 1 ||
    title.length > 100 ||
    typeof createdAt !== "number" ||
    typeof updatedAt !== "number" ||
    !Number.isSafeInteger(createdAt) ||
    !Number.isSafeInteger(updatedAt) ||
    createdAt <= 0 ||
    updatedAt < createdAt
  )
    return null;
  return {
    id,
    title,
    createdAt,
    updatedAt,
  };
}

export function parseArchivedPreview(
  value: unknown,
  boardId: string,
): LinkPreview | null {
  if (!isRecord(value)) return null;
  const { url, title, description, imageUrl, videoUrl, siteName } = value;
  if (
    typeof url !== "string" ||
    normalizeLinkUrl(url) !== url ||
    typeof title !== "string" ||
    title.length < 1 ||
    title.length > 200 ||
    typeof description !== "string" ||
    description.length > 700 ||
    typeof siteName !== "string" ||
    siteName.length > 100 ||
    (imageUrl !== null &&
      (typeof imageUrl !== "string" ||
        (normalizeLinkUrl(imageUrl) !== imageUrl &&
          !new RegExp(`^/previews/${boardId}/[0-9a-f]{64}$`).test(
            imageUrl,
          )))) ||
    (videoUrl !== undefined &&
      videoUrl !== null &&
      (typeof videoUrl !== "string" ||
        normalizeXVideoUrl(videoUrl) !== videoUrl))
  )
    return null;
  return {
    url,
    title,
    description,
    imageUrl: imageUrl as string | null,
    videoUrl: (videoUrl ?? null) as string | null,
    siteName,
  };
}
