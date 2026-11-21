import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const maximumBytes = 8 * 1024 * 1024;
const types: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
function assetPath(value: string): boolean {
  return (
    value.length <= 512 &&
    value.split("/").length <= 8 &&
    value
      .split("/")
      .every((part) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(part) && !part.includes("..")) &&
    Object.hasOwn(types, path.extname(value).toLowerCase())
  );
}

export function imageHref(space: string, articlePath: string, source: string): string | undefined {
  if (source.length > 1024) return;
  const authored = /^(?:\/|(?:\.\/)?(?:\.\.\/){0,8})images\/(.+)$/.exec(source);
  if (!authored || authored[0] !== source || !assetPath(authored[1]!)) return;
  let url: URL;
  try {
    url = new URL(source, `http://atlas.local${articlePath}`);
  } catch {
    return;
  }
  if (
    url.origin !== "http://atlas.local" ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith("/images/")
  )
    return;
  const asset = url.pathname.slice("/images/".length);
  return assetPath(asset) ? `/_atlas/images/${space}/${asset}` : undefined;
}

function matchesType(bytes: Buffer, type: string): boolean {
  if (type === "image/png")
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/gif")
    return ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
  return (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  );
}

/** Linux directory descriptors prevent ancestor replacement/symlink races, not just leaf links. */
async function openRaster(filename: string) {
  const parts = path.resolve(filename).split(path.sep).filter(Boolean);
  let directory = await open("/", constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    for (const part of parts.slice(0, -1)) {
      const next = await open(
        `/proc/self/fd/${directory.fd}/${part}`,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      await directory.close();
      directory = next;
    }
    return await open(
      `/proc/self/fd/${directory.fd}/${parts.at(-1)!}`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } finally {
    await directory.close();
  }
}

export async function serveImage(
  request: Request,
  root: string,
  spaces: readonly { id: string; directory: string }[],
): Promise<Response> {
  const missing = () =>
    new Response("Not Found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const url = new URL(request.url);
  const match = /^\/_atlas\/images\/([a-z][a-z0-9-]{0,63})\/(.+)$/.exec(url.pathname);
  const space = match && spaces.find((entry) => entry.id === match[1]);
  if (!match || !space || url.search || !assetPath(match[2]!)) return missing();
  const filename = path.join(root, space.directory, "images", match[2]!);
  try {
    const file = await openRaster(filename);
    let bytes: Buffer;
    try {
      const before = await file.stat();
      if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > maximumBytes)
        return missing();
      const buffer = Buffer.alloc(before.size + 1);
      let count = 0;
      while (count < buffer.length) {
        const read = await file.read(buffer, count, buffer.length - count, count);
        if (!read.bytesRead) break;
        count += read.bytesRead;
      }
      const after = await file.stat();
      if (
        count !== before.size ||
        after.size !== before.size ||
        after.nlink !== 1 ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs
      )
        return missing();
      bytes = buffer.subarray(0, count);
    } finally {
      await file.close();
    }
    const type = types[path.extname(filename).toLowerCase()]!;
    if (!matchesType(bytes, type)) return missing();
    const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
    const headers = {
      "Content-Type": type,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ETag: etag,
    };
    return request.headers.get("If-None-Match") === etag
      ? new Response(null, { status: 304, headers })
      : new Response(new Uint8Array(bytes), { headers });
  } catch {
    return missing();
  }
}
