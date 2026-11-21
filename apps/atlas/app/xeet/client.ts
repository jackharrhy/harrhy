export interface Snapshot {
  text: string;
  author: { name: string; handle: string };
  publishedAt: string;
  capturedAt: string;
  media: { src: string; alt: string }[];
}
export interface RenderOptions {
  theme: "light" | "dark";
  surface: "web-detail" | "web-timeline";
  width: 390 | 600;
  dpr: 1 | 2;
}
export interface RenderResult {
  png: Uint8Array;
  report: unknown;
}

/** One bounded, disposable renderer; never evaluates authored code in the worker. */
export function createRenderer(signal: AbortSignal) {
  if (signal.aborted) throw new Error("Renderer disposed");
  const worker = new Worker("/_atlas/xeet-worker.js", { type: "module" });
  let pending: { reject(reason: Error): void } | undefined;
  let disposed = false;
  function dispose() {
    disposed = true;
    worker.terminate();
    signal.removeEventListener("abort", dispose);
    window.removeEventListener("pagehide", dispose);
    pending?.reject(new Error("Renderer disposed"));
  }
  signal.addEventListener("abort", dispose, { once: true });
  window.addEventListener("pagehide", dispose, { once: true });
  return {
    dispose,
    render(snapshot: Snapshot, options: RenderOptions): Promise<RenderResult> {
      if (disposed || signal.aborted) return Promise.reject(new Error("Renderer disposed"));
      if (pending) return Promise.reject(new Error("Renderer busy"));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          dispose();
        }, 8000);
        function finish() {
          clearTimeout(timer);
          pending = undefined;
          worker.onmessage = null;
          worker.onerror = null;
        }
        pending = {
          reject(error) {
            finish();
            reject(error);
          },
        };
        worker.onerror = (event) => {
          finish();
          dispose();
          reject(new Error(`Xeet worker failed: ${event.message || "initialization error"}`));
        };
        worker.onmessage = (event) => {
          finish();
          if (event.data?.error) reject(new Error(String(event.data.error).slice(0, 240)));
          else if (event.data?.png instanceof Uint8Array) resolve(event.data);
          else reject(new Error("Invalid Xeet result"));
        };
        try {
          worker.postMessage({ snapshot, options });
        } catch (error) {
          finish();
          reject(error);
        }
      });
    },
  };
}

export async function paintPng(canvas: HTMLCanvasElement, png: Uint8Array) {
  if (
    png.byteLength < 24 ||
    png.byteLength > 8388608 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => png[i] === byte)
  )
    throw new Error("Invalid Xeet PNG");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (!width || !height || width > 1200 || height > 6000 || width * height > 6000000)
    throw new Error("Xeet PNG dimensions exceed limit");
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: "image/png" }));
  try {
    if (bitmap.width !== width || bitmap.height !== height)
      throw new Error("PNG dimensions mismatch");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0);
  } finally {
    bitmap.close();
  }
  return { width, height };
}
