// The generated module and its pinned WASM are supplied by the reviewed Xeet source build.
import init, { call, upstream_version } from "./vendor/xeet_wasm.js";
import type { Snapshot, RenderOptions } from "./client.ts";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
let initialized: Promise<unknown> | undefined;
async function initialize() {
  const response = await fetch("/xeet/50dd9b5a450e394b.wasm", {
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "application/wasm")
    throw new Error("Xeet WASM unavailable");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== 5179323 || new DataView(bytes).getUint32(0) !== 0x0061736d)
    throw new Error("Invalid Xeet WASM asset");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== "50dd9b5a450e394b5bec145ceb79139117cb84949f6b2737e31dd283d03f55ae")
    throw new Error("Xeet WASM integrity mismatch");
  return init({ module_or_path: bytes });
}
let busy = false;
const images = new Map<string, { data: string; width: number; height: number }>();

function imageDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) &&
        length >= 7
      )
        return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      offset += length;
    }
  }
  throw new Error("Expected a bounded PNG or JPEG photo");
}
async function photo(src: string) {
  const cached = images.get(src);
  if (cached) return cached;
  if (
    !/^\/_atlas\/images\/[a-z][a-z0-9-]{0,63}\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.(?:jpg|jpeg|png)$/.test(
      src,
    )
  )
    throw new Error("Expected registered local photo");
  const response = await fetch(src, { credentials: "same-origin", redirect: "error" });
  if (!response.ok || !response.body) throw new Error("Local photo unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2097152) {
      await reader.cancel();
      throw new Error("Photo exceeds limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const { width, height } = imageDimensions(bytes);
  if (!width || !height || width > 2048 || height > 2048 || width * height > 2000000)
    throw new Error("Photo dimensions exceed limit");
  const bitmap = await createImageBitmap(new Blob([bytes]));
  const decodedWidth = bitmap.width,
    decodedHeight = bitmap.height;
  bitmap.close();
  if (decodedWidth !== width || decodedHeight !== height)
    throw new Error("Photo dimensions mismatch");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const result = { data: btoa(binary), width, height };
  if (images.size >= 4) images.clear();
  images.set(src, result);
  return result;
}
function validate(snapshot: Snapshot, options: RenderOptions) {
  if (
    !snapshot ||
    typeof snapshot.text !== "string" ||
    snapshot.text.length > 2000 ||
    typeof snapshot.author?.name !== "string" ||
    snapshot.author.name.length > 120 ||
    !/^[a-zA-Z0-9_]{1,15}$/.test(snapshot.author.handle) ||
    !Number.isFinite(Date.parse(snapshot.publishedAt)) ||
    !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
    !Array.isArray(snapshot.media) ||
    snapshot.media.length > 4 ||
    snapshot.media.some(
      (p) => typeof p.src !== "string" || typeof p.alt !== "string" || p.alt.length > 500,
    ) ||
    !options ||
    !["light", "dark"].includes(options.theme) ||
    !["web-detail", "web-timeline"].includes(options.surface) ||
    ![390, 600].includes(options.width) ||
    ![1, 2].includes(options.dpr)
  )
    throw new Error("Invalid bounded Xeet request");
}
scope.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    const { snapshot, options } = data;
    validate(snapshot, options);
    initialized ??= initialize();
    await initialized;
    const media = [];
    for (const item of snapshot.media)
      media.push({ kind: "image", ...(await photo(item.src)), alt: item.alt });
    const frame = call(
      1,
      JSON.stringify({
        op: "render",
        post: {
          text: snapshot.text,
          author: { name: snapshot.author.name, handle: snapshot.author.handle },
          createdAt: snapshot.publishedAt,
          now: snapshot.capturedAt,
          media,
        },
        options: {
          theme: options.theme,
          surface: options.surface,
          width: options.width,
          dpr: options.dpr,
          fontScale: 1,
          expanded: true,
        },
      }),
    );
    if (frame.length < 13 || frame.length > 8454144) throw new Error("Invalid Xeet frame");
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const payload = view.getUint32(1, true),
      reportLength = view.getUint32(5, true);
    if (
      view.getUint32(9, true) !== frame.length ||
      payload + reportLength + 13 !== frame.length ||
      reportLength > 65536
    )
      throw new Error("Invalid Xeet frame lengths");
    if (frame[0] !== 0)
      throw new Error(new TextDecoder().decode(frame.subarray(13, 13 + Math.min(payload, 240))));
    const png = frame.slice(13, 13 + payload);
    const report = reportLength
      ? JSON.parse(new TextDecoder().decode(frame.subarray(13 + payload)))
      : null;
    scope.postMessage({ png, report, upstream: upstream_version() }, [png.buffer]);
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message.slice(0, 240) : "Xeet render failed",
    });
  } finally {
    busy = false;
  }
};
