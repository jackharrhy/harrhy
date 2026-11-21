import { parseArchivedPreview, parseBoardRecord } from "./archive.ts";
import { tokenHash } from "./crypto.ts";
import {
  imageType,
  MAX_PREVIEW_BYTES,
  MAX_UPLOAD_BYTES,
} from "./image-upload.ts";
import { isUuid, type LinkPreview } from "./protocol.ts";

// Limits include the final manifest, tar headers and block padding. The historic
// transfer had 1 board, 49 items and 48 media files. Never buffer a whole tar.
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST = 4 * 1024 * 1024;
const MAX_FILES = 256;
const MAX_BOARDS = 32;
const MAX_ITEMS = 4_000;
const encoder = new TextEncoder();

export class ArchiveUnavailable extends Error {}

function requireArchive(ok: unknown): asserts ok {
  if (!ok) throw new ArchiveUnavailable("Archive unavailable");
}

// POSIX ustar. Split even short paths at the last slash: preview paths exceed
// the 100-byte name field. All input names here are ASCII constants or IDs.
function tarHeader(path: string, size: number) {
  const header = new Uint8Array(512);
  const text = (offset: number, value: string) =>
    header.set(encoder.encode(value), offset);
  const octal = (offset: number, digits: number, value: number) =>
    text(offset, value.toString(8).padStart(digits, "0"));
  const slash = path.lastIndexOf("/");
  text(0, path.slice(slash + 1));
  if (slash >= 0) text(345, path.slice(0, slash));
  octal(100, 7, 0o600);
  octal(108, 7, 0);
  octal(116, 7, 0);
  octal(124, 11, size);
  octal(136, 11, 0);
  header.fill(32, 148, 156); // checksum is computed with spaces in its field
  text(156, "0"); // regular file
  text(257, "ustar");
  text(263, "00");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  octal(148, 6, checksum);
  header[154] = 0;
  return header;
}

export async function writeExportArchive(
  env: Pick<Env, "DIRECTORY" | "BOARDS" | "MEDIA">,
  append: (data: Uint8Array<ArrayBuffer>) => void,
  checkActive: () => void,
): Promise<number> {
  let total = 0;
  let files = 0;
  function checkFile(size: number) {
    requireArchive(
      files < MAX_FILES &&
      total + 512 + Math.ceil(size / 512) * 512 + 1024 <= MAX_BYTES,
    );
  }
  function file(path: string, bytes: Uint8Array<ArrayBuffer>) {
    checkActive();
    checkFile(bytes.length);
    const pad = (512 - (bytes.length % 512)) % 512;
    append(tarHeader(path, bytes.length));
    append(bytes);
    if (pad) append(new Uint8Array(pad));
    total += 512 + bytes.length + pad;
    files++;
  }

  async function mediaFile(boardId: string, id: string, preview: boolean) {
    checkActive();
    const asset = preview
      ? null
      : await env.BOARDS.getByName(boardId).asset(boardId, id);
    const key = `boards/${boardId}/${preview ? "previews/" : ""}${id}`;
    requireArchive(preview || asset?.objectKey === key);
    const object = await env.MEDIA.get(key);
    requireArchive(object);
    const size = object.size;
    const limit = preview ? MAX_PREVIEW_BYTES : MAX_UPLOAD_BYTES;
    const contentType = asset?.contentType ?? object.httpMetadata?.contentType;
    try {
      requireArchive(
        Number.isSafeInteger(size) && size > 0 && size <= limit &&
        (!asset || size === asset.size),
      );
      checkFile(size);
    } catch (error) {
      await object.body.cancel();
      throw error;
    }
    const buffer = await object.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const header = new File([bytes.subarray(0, 16)], "header");
    requireArchive(
      contentType && bytes.length === size &&
      (await imageType(header, limit)) === contentType,
    );
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
    const sha256 = Array.from(digest, (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    file(`${preview ? "previews" : "assets"}/${boardId}/${id}`, bytes);
    return { id, size, contentType, sha256 };
  }

  const directory = env.DIRECTORY.getByName("main");
  const records = await directory.listBoards();
  requireArchive(records.length <= MAX_BOARDS);
  const snapshots = new Map<string, string>();
  const boards: string[] = [];
  let items = 0;
  let manifestBytes = 0;
  for (const record of records) {
    checkActive();
    const { id } = record;
    requireArchive(parseBoardRecord(record) && !snapshots.has(id));
    const snapshot = await env.BOARDS.getByName(id).snapshot(id);
    items += snapshot.items.length;
    requireArchive(
      snapshot.boardId === id && snapshot.items.length <= 2_000 && items <= MAX_ITEMS,
    );
    const serialized = JSON.stringify(snapshot);
    requireArchive(serialized.length <= MAX_MANIFEST - manifestBytes);
    snapshots.set(id, await tokenHash(serialized));

    const filenames = new Map<string, string>();
    const links = new Map<string, LinkPreview>();
    const previewIds = new Set<string>();
    for (const item of snapshot.items) {
      requireArchive(isUuid(item.assetId));
      if (item.link) {
        requireArchive(
          parseArchivedPreview(item.link, id) &&
          JSON.stringify(item.link).length <= 4096,
        );
        links.set(item.assetId, item.link);
        const prefix = `/previews/${id}/`;
        if (item.link.imageUrl?.startsWith(prefix))
          previewIds.add(item.link.imageUrl.slice(prefix.length));
      } else {
        requireArchive(
          item.filename.length > 0 && item.filename.length <= 160 &&
          !/[\0/\\]/.test(item.filename),
        );
        filenames.set(item.assetId, item.filename);
      }
    }
    requireArchive(files + filenames.size + previewIds.size + 1 <= MAX_FILES);
    const assets = [];
    const previews = [];
    for (const [assetId, filename] of filenames) {
      assets.push({ ...(await mediaFile(id, assetId, false)), filename });
    }
    for (const previewId of previewIds)
      previews.push(await mediaFile(id, previewId, true));
    const board = JSON.stringify({
      record,
      items: snapshot.items,
      assets,
      links: Array.from(links, ([assetId, preview]) => ({ assetId, preview })),
      previews,
    });
    manifestBytes += encoder.encode(board).length + 1;
    requireArchive(manifestBytes <= MAX_MANIFEST);
    boards.push(board);
  }

  // Re-read after *all* media is staged. Link refresh can change a snapshot
  // without advancing its sequence; hash items and metadata, not just counters.
  for (const [id, hash] of snapshots) {
    checkActive();
    const after = await env.BOARDS.getByName(id).snapshot(id);
    requireArchive((await tokenHash(JSON.stringify(after))) === hash);
  }
  const after = await directory.listBoards();
  requireArchive(JSON.stringify(records) === JSON.stringify(after));
  const manifest = encoder.encode(
    `{"format":"ref-archive","version":1,"createdAt":"${new Date().toISOString()}","boards":[${boards.join(",")}]}\n`,
  );
  requireArchive(manifest.length <= MAX_MANIFEST);
  file("manifest.json", manifest);
  append(new Uint8Array(1024));
  return total + 1024;
}
