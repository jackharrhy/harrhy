const CACHE_NAME = "ref-board-images-v1";

class BoardImages {
  private worker: Worker | null = null;
  private urls = new Map<string, string>();
  private waiting = new Map<string, Set<HTMLImageElement>>();
  private requested = new Set<string>();
  private detail = new WeakMap<HTMLImageElement, boolean>();
  private pending = new WeakMap<
    HTMLImageElement,
    { source: string; image: HTMLImageElement }
  >();

  constructor() {
    try {
      this.worker = new Worker("/assets/thumb-worker.js");
      this.worker.addEventListener(
        "message",
        (event: MessageEvent<{ source: string; image: Blob | null }>) => {
          const { source, image } = event.data;
          this.requested.delete(source);
          const group = this.waiting.get(source);
          if (!image || !group?.size) return;
          const url = this.saveUrl(source, image);
          for (const element of group) {
            if (element.isConnected) this.show(element, url);
          }
        },
      );
    } catch {}
    window.addEventListener("pagehide", (event) => {
      if (event.persisted) return;
      this.worker?.terminate();
      for (const url of this.urls.values()) URL.revokeObjectURL(url);
    });
  }

  load(element: HTMLImageElement, source: string): void {
    element.dataset.original = source;
    if (!/^\/(?:media|previews)\//.test(source) || !("caches" in window)) {
      this.show(element, source);
      return;
    }
    let group = this.waiting.get(source);
    if (!group) {
      group = new Set();
      this.waiting.set(source, group);
    }
    group.add(element);
    const known = this.urls.get(source);
    if (known) {
      this.show(element, known);
      return;
    }
    const fallback = window.setTimeout(() => this.show(element, source), 80);
    void caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(source))
      .then(async (cached) => {
        if (!element.isConnected) return;
        if (cached) {
          const url = this.saveUrl(source, await cached.blob());
          this.show(element, url);
        } else {
          this.show(element, source);
          if (this.worker && !this.requested.has(source)) {
            this.requested.add(source);
            // Worker.postMessage does not take a target origin.
            // eslint-disable-next-line unicorn/require-post-message-target-origin
            this.worker.postMessage(source);
          }
        }
      })
      .catch(() => this.show(element, source))
      .finally(() => clearTimeout(fallback));
  }

  setDetail(element: HTMLImageElement, value: boolean): void {
    this.detail.set(element, value);
    const source = element.dataset.original;
    if (source) this.show(element, this.urls.get(source) ?? source);
  }

  forget(element: HTMLImageElement): void {
    this.cancelPending(element);
    this.detail.delete(element);
    const source = element.dataset.original;
    if (!source) return;
    const group = this.waiting.get(source);
    group?.delete(element);
    if (group?.size) return;
    this.waiting.delete(source);
    const url = this.urls.get(source);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(source);
    if (/^\/(?:media|previews)\//.test(source) && "caches" in window)
      void caches
        .open(CACHE_NAME)
        .then((cache) => cache.delete(source))
        .catch(() => {});
  }

  private saveUrl(source: string, image: Blob): string {
    const existing = this.urls.get(source);
    if (existing) return existing;
    const url = URL.createObjectURL(image);
    this.urls.set(source, url);
    return url;
  }

  private show(element: HTMLImageElement, preview: string): void {
    if (!element.isConnected) return;
    const desired = this.detail.get(element)
      ? element.dataset.original!
      : preview;
    if (element.getAttribute("src") === desired) {
      this.cancelPending(element);
      return;
    }
    if (this.pending.get(element)?.source === desired) return;
    this.cancelPending(element);
    const image = new Image();
    image.referrerPolicy = element.referrerPolicy;
    const candidate = { source: desired, image };
    this.pending.set(element, candidate);
    image.src = desired;
    // Changing a visible img's src before decoding can clear its painted frame.
    void image.decode().then(
      () => {
        if (this.pending.get(element) !== candidate) return;
        this.pending.delete(element);
        if (element.isConnected) {
          element.src = desired;
          element.dataset.imageState = "ready";
        }
      },
      () => {
        if (this.pending.get(element) !== candidate) return;
        this.pending.delete(element);
        if (!element.isConnected) return;
        const original = element.dataset.original;
        if (desired !== original && original) this.show(element, original);
        else if (!element.hasAttribute("src"))
          element.dispatchEvent(new Event("error"));
      },
    );
  }

  private cancelPending(element: HTMLImageElement): void {
    const candidate = this.pending.get(element);
    if (!candidate) return;
    this.pending.delete(element);
    candidate.image.removeAttribute("src");
  }
}

export const boardImages = new BoardImages();
