import { itemGeometry } from "../data/protocol.ts";
import type {
  BoardItem,
  BoardOperation,
  BoardServerFrame,
  BoardSnapshot,
  LinkPreview,
} from "../data/protocol.ts";
import {
  displayFilename,
  displaySiteName,
  renderItemInspector,
} from "./inspector.ts";
import { boardImages } from "./board-images.ts";
import { attachViewport } from "@harrhy/board/viewport";
import { nodeStyle, type Point } from "@harrhy/board/geometry";
import { registerWebMcpTools } from "@harrhy/webmcp";
import type { WebMcpRegistration } from "@harrhy/webmcp";
import { boardWebMcpTools } from "./board-webmcp.ts";

const app = document.querySelector<HTMLElement>("#board-app");
if (!app) throw new Error("Board root is missing");
const boardId = app.dataset.boardId!;
const viewport = required<HTMLElement>("#viewport");
const world = required<HTMLElement>("#world");
const pickerElement = document.querySelector("select#card-picker");
if (!(pickerElement instanceof HTMLSelectElement))
  throw new Error("Card picker is missing");
const picker = pickerElement;
const loading = required<HTMLElement>("#board-loading");
let hasSnapshot = false;
const empty = required<HTMLElement>("#empty-state");
const fileInput = required<HTMLInputElement>("#file-input");
const inspector = required<HTMLElement>("#inspector-content");
const connection = required<HTMLElement>("#connection");
const inspectorPanel = required<HTMLElement>("#inspector");
const zoomLabel = required<HTMLElement>("#zoom-label");
const toastElement = required<HTMLElement>("#toast");
const linkMenu = required<HTMLDetailsElement>("#link-menu");
const linkForm = required<HTMLFormElement>("#link-form");
const linkInput = required<HTMLInputElement>("#link-url");

const titleForm = required<HTMLFormElement>("#board-title-form");
const titleInput = required<HTMLInputElement>("#board-title");
let savedTitle = titleInput.value;
const liveEnabled = app.dataset.liveBoard === "1";
async function renameForm(): Promise<string | null> {
  const response = await fetch(titleForm.action, {
    method: "POST",
    body: new FormData(titleForm),
    headers: { Accept: "application/json" },
    redirect: "error",
    keepalive: true,
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 400) return null;
  if (!response.ok) throw new Error("Rename not confirmed");
  return ((await response.json()) as { title: string }).title;
}
async function saveTitle() {
  if (
    titleInput.readOnly ||
    connectionState === "ended" ||
    titleInput.value === savedTitle
  )
    return;
  titleInput.readOnly = true;
  try {
    // Choose before dispatch. Never replay an unconfirmed mutation over HTTP.
    const title = liveBoard?.connected
      ? await liveBoard.rename(titleInput.value)
      : await renameForm();
    if (title === null) {
      toast("Name not saved. Enter a board name of 1–100 characters.");
      return;
    }
    savedTitle = title;
    document.title = `${title} · ref`;
  } catch {
    toast("Rename not confirmed. Reload to check the board name.");
  } finally {
    titleInput.value = savedTitle;
    titleInput.readOnly = false;
  }
}
titleInput.addEventListener("blur", saveTitle);
titleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveTitle();
});
titleInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.isComposing) {
    event.preventDefault();
    titleInput.value = savedTitle;
  }
});

type Drag =
  | { kind: "pan"; move(event: PointerEvent): void }
  | {
      kind: "move" | "resize" | "rotate";
      start: Point;
      original: BoardItem;
      moved: boolean;
    };
const items = new Map<string, BoardItem>();
const elements = new Map<string, HTMLElement>();
const pending = new Map<string, BoardOperation>();
const imageObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target as HTMLElement;
      const image = element.querySelector<HTMLImageElement>("img[data-src]");
      if (image?.dataset.src) {
        boardImages.load(image, image.dataset.src);
        delete image.dataset.src;
      }
      imageObserver.unobserve(element);
    }
  },
  { root: viewport, rootMargin: "80px" },
);
let socket: WebSocket | null = null;
let reconnectTimer = 0;
let reconnectDelay = 500;
let heartbeatTimer = 0;
let lastHeard = 0;
let selectedId: string | null = null;
let spaceHeld = false;
// A platform convention, not a guess about the attached pointing device.
let scrollMode: "zoom" | "pan" = navigator.platform.startsWith("Mac")
  ? "pan"
  : "zoom";
try {
  const saved = localStorage.getItem("ref-scroll-mode");
  if (saved === "pan" || saved === "zoom") scrollMode = saved;
} catch {
  // Restricted browsers may disable storage.
}
const scrollModeButton = required<HTMLButtonElement>("#scroll-mode");
function updateScrollMode() {
  scrollModeButton.textContent = `Scroll: ${scrollMode === "pan" ? "Pan" : "Zoom"}`;
  scrollModeButton.setAttribute("aria-pressed", String(scrollMode === "pan"));
}
updateScrollMode();
scrollModeButton.addEventListener("click", () => {
  scrollMode = scrollMode === "zoom" ? "pan" : "zoom";
  updateScrollMode();
  try {
    localStorage.setItem("ref-scroll-mode", scrollMode);
  } catch {}
});
let drag: Drag | null = null;
const view = attachViewport(viewport, world, {
  wheelMode: () => scrollMode,
  onView() {
    scheduleZoomLabel();
    scheduleImageDetail();
  },
});
const { screenPoint, worldPoint, zoomAt } = view;
let didInitialFit = false;
let sequence = 0;
let toastTimer = 0;
let zoomLabelTimer = 0;
let lastZoomLabelAt = -Infinity;
let imageDetailTimer = 0;
type Connection = "connecting" | "online" | "offline" | "ended";
let connectionState: Connection = "connecting";
const toolOperations = new Map<
  string,
  {
    resolve(value: unknown): void;
    reject(reason: Error): void;
  }
>();
let browserTools: WebMcpRegistration | null = null;
let pageHidden = false;

function disposeBrowserTools() {
  browserTools?.dispose();
  browserTools = null;
}

function requireToolBoard() {
  if (connectionState !== "online" || socket?.readyState !== WebSocket.OPEN)
    throw new Error("Board is not live. Wait for reconnection and try again.");
  if (drag || pending.size)
    throw new Error(
      "Board has an active gesture or unsaved edits. Wait before trying again.",
    );
}

function requireToolItem(id: string): BoardItem {
  const item = items.get(id);
  if (!item) throw new Error("Item is not on this board");
  return item;
}

const browserToolCatalog = boardWebMcpTools({
  context: (offset) => ({
    boardId,
    sequence,
    live: connectionState === "online" && socket?.readyState === WebSocket.OPEN,
    pendingEdits: pending.size,
    interaction: drag?.kind ?? null,
    selectedItemId: selectedId,
    camera: {
      ...view.camera,
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    },
    totalItems: items.size,
    offset,
    nextOffset: offset + 200 < items.size ? offset + 200 : null,
    items: structuredClone([...items.values()].slice(offset, offset + 200)),
  }),
  select(id) {
    requireToolBoard();
    if (id) requireToolItem(id);
    select(id);
  },
  focus(id) {
    requireToolBoard();
    const item = requireToolItem(id);
    const radians = (item.rotation * Math.PI) / 180;
    const width =
      Math.abs(item.width * Math.cos(radians)) +
      Math.abs(item.height * Math.sin(radians));
    const height =
      Math.abs(item.width * Math.sin(radians)) +
      Math.abs(item.height * Math.cos(radians));
    const scale = Math.max(
      0.1,
      Math.min(
        5,
        (viewport.clientWidth - 64) / width,
        (viewport.clientHeight - 64) / height,
      ),
    );
    view.set({
      scale,
      offsetX: viewport.clientWidth / 2 - (item.x + item.width / 2) * scale,
      offsetY: viewport.clientHeight / 2 - (item.y + item.height / 2) * scale,
    });
  },
  fit() {
    requireToolBoard();
    fitBoard();
  },
  mutate(operation, signal) {
    requireToolBoard();
    if (operation.kind === "create")
      throw new Error("Creating resources is not supported by browser tools");
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(
        () =>
          finish(
            new Error(
              "Edit submitted; confirmation timed out. Read the board before retrying.",
            ),
          ),
        15_000,
      );
      function finish(error?: Error, value?: unknown) {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        toolOperations.delete(operation.operationId);
        if (error) reject(error);
        else resolve(value);
      }
      function abort() {
        finish(
          new Error(
            "Edit submitted; cancellation cannot undo it. Read the board to check its outcome.",
          ),
        );
      }
      toolOperations.set(operation.operationId, {
        resolve: (value) => finish(undefined, value),
        reject: (error) => finish(error),
      });
      signal.addEventListener("abort", abort, { once: true });
      submit(operation);
    });
  },
});

function registerBrowserTools() {
  if (browserTools || pageHidden) return;
  const registration = registerWebMcpTools(document, browserToolCatalog);
  if (!registration.supported) {
    registration.dispose();
    return;
  }
  browserTools = registration;
  void registration.ready.catch(() => {
    if (browserTools === registration) {
      disposeBrowserTools();
      console.warn(
        "Ref browser tool registration failed; ordinary board controls remain available.",
      );
    }
  });
}
window.addEventListener("pagehide", () => {
  pageHidden = true;
  stopConnection();
  if (connectionState !== "ended") setConnection("offline");
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  pageHidden = false;
  connect();
});

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

let liveBoard:
  | ReturnType<typeof import("../cursors/browser.ts").openLiveBoard>
  | undefined;
let cursorEpoch = 0;
function setConnection(value: Connection) {
  if (liveEnabled && value !== connectionState) {
    const epoch = ++cursorEpoch;
    liveBoard?.stop();
    liveBoard = undefined;
    if (value === "online")
      void import("../cursors/browser.ts")
        .then(({ openLiveBoard }) => {
          if (epoch === cursorEpoch)
            liveBoard = openLiveBoard(boardId, viewport, world, (event) =>
              worldPoint(screenPoint(event)),
            );
        })
        .catch(() => console.warn("Board cursors unavailable"));
  }
  connectionState = value;
  connection.className = `connection ${value}`;
  required<HTMLElement>(".connection-text").textContent = {
    online: "Live",
    offline: "Reconnecting",
    connecting: "Connecting",
    ended: "Access ended",
  }[value];
}

function toast(message: string) {
  toastElement.textContent = message;
  toastElement.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => toastElement.classList.remove("visible"),
    3400,
  );
}

function connect() {
  if (pageHidden || connectionState === "ended") return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(
    `${protocol}//${location.host}/api/boards/${boardId}/ws`,
  );
  socket = ws;
  ws.addEventListener("open", () => {
    if (socket !== ws) return;
    lastHeard = Date.now();
    const openedAt = lastHeard;
    heartbeatTimer = window.setInterval(() => {
      if (
        Date.now() - (connectionState === "online" ? lastHeard : openedAt) >
        12_000
      ) {
        reconnect(ws);
        return;
      }
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "ping" }));
    }, 4_000);
  });
  ws.addEventListener("message", (event) => {
    if (socket !== ws) return;
    lastHeard = Date.now();
    try {
      receive(JSON.parse(String(event.data)) as BoardServerFrame);
    } catch (error) {
      console.error("Could not read board update", error);
    }
  });
  ws.addEventListener("close", (event) => {
    if (socket !== ws) return;
    if (event.reason === "Session ended") endAccess();
    else reconnect(ws);
  });
  ws.addEventListener("error", () => ws.close());
}

let probe: AbortController | null = null;
function stopConnection() {
  clearTimeout(reconnectTimer);
  clearInterval(heartbeatTimer);
  probe?.abort();
  probe = null;
  const ws = socket;
  socket = null;
  ws?.close();
  disposeBrowserTools();
}

function endAccess() {
  stopConnection();
  setConnection("ended");
  pending.clear();
  drag = null;
  selectedId = null;
  items.clear();
  renderItems();
  required<HTMLButtonElement>("#tool-add").disabled = true;
  for (const selector of [".board-layout", "#board-title-form", "#link-menu"])
    required<HTMLElement>(selector).inert = true;
  toast(
    "Your board access ended. Return to your boards. Unconfirmed edits may not have been saved.",
  );
}

async function reconnect(ws: WebSocket) {
  if (socket !== ws) return;
  stopConnection();
  setConnection("offline");
  const attempt = new AbortController();
  probe = attempt;
  try {
    const response = await fetch(`/api/boards/${boardId}/snapshot`, {
      cache: "no-store",
      signal: AbortSignal.any([attempt.signal, AbortSignal.timeout(5000)]),
    });
    if (attempt.signal.aborted) return;
    if ([401, 403, 404].includes(response.status)) {
      endAccess();
      return;
    }
  } catch {
    /* A transient probe failure still retries the socket. */
  }
  if (attempt.signal.aborted) return;
  probe = null;
  reconnectTimer = window.setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.8, 8000);
}

function receive(frame: BoardServerFrame) {
  if (frame.type === "ready") {
    loadSnapshot(frame.snapshot);
    setConnection("online");
    reconnectDelay = 500;
    registerBrowserTools();
    if (!didInitialFit) {
      didInitialFit = true;
      fitBoard();
      if (items.size > 12 && view.camera.scale < 0.65)
        zoomAt(0.65 / view.camera.scale, {
          x: viewport.clientWidth / 2,
          y: viewport.clientHeight / 2,
        });
      requestAnimationFrame(() => {
        for (const element of elements.values()) observeImage(element);
      });
    }
    for (const operation of pending.values())
      send({ type: "operation", operation });
    return;
  }
  if (frame.type === "pong") return;
  if (frame.type === "applied") {
    pending.delete(frame.operationId);
    toolOperations.get(frame.operationId)?.resolve({
      status: "applied",
      sequence: frame.sequence,
      item: structuredClone(frame.item),
    });
    if (frame.sequence <= sequence) return;
    if (frame.sequence > sequence + 1) {
      if (socket) void reconnect(socket);
      return;
    }
    sequence = frame.sequence;
    if (frame.item) {
      items.set(frame.itemId, frame.item);
      renderItem(frame.item);
    } else {
      items.delete(frame.itemId);
      removeElement(frame.itemId);
      if (selectedId === frame.itemId) selectedId = null;
    }
    renderBoardStatus();
    if (selectedId === frame.itemId || !frame.item) renderInspector();
    return;
  }
  if (frame.type === "rejected") {
    pending.delete(frame.operationId);
    toolOperations.get(frame.operationId)?.reject(new Error(frame.reason));
    if (frame.snapshot.sequence >= sequence) loadSnapshot(frame.snapshot);
    toast(frame.reason);
    return;
  }
  if (frame.type === "error") {
    toast(frame.message);
    if (frame.message.includes("Session ended")) {
      endAccess();
    }
  }
}

async function refreshSnapshot() {
  const ws = socket;
  const response = await fetch(`/api/boards/${boardId}/snapshot`);
  if (!response.ok) throw new Error("Could not read the updated board");
  const snapshot = (await response.json()) as BoardSnapshot;
  if (!ws || ws !== socket || connectionState !== "online")
    throw new Error("Board is not live");
  if (snapshot.sequence >= sequence) loadSnapshot(snapshot);
}

function loadSnapshot(snapshot: BoardSnapshot) {
  hasSnapshot = true;
  sequence = snapshot.sequence;
  items.clear();
  for (const item of snapshot.items) items.set(item.id, item);
  if (selectedId && !items.has(selectedId)) selectedId = null;
  renderItems();
}

function send(frame: unknown): boolean {
  if (connectionState !== "online" || socket?.readyState !== WebSocket.OPEN)
    return false;
  socket.send(JSON.stringify(frame));
  return true;
}

function submit(operation: BoardOperation) {
  pending.set(operation.operationId, operation);
  if (!send({ type: "operation", operation }))
    toast("Change queued in this tab. Waiting for reconnection.");
}

function positionElement(element: HTMLElement, item: BoardItem) {
  const image =
    item.link && element.querySelector<HTMLImageElement>(".link-card-image");
  let width = item.width;
  let height = item.height;
  if (image?.naturalWidth && image.naturalHeight) {
    const fit = Math.min(
      width / image.naturalWidth,
      height / image.naturalHeight,
    );
    width = image.naturalWidth * fit;
    height = image.naturalHeight * fit;
  }
  Object.assign(
    element.style,
    nodeStyle({
      x: item.x + (item.width - width) / 2,
      y: item.y + (item.height - height) / 2,
      width,
      height,
    }),
  );
  element.style.zIndex = String(item.z);
  element.style.transform = `rotate(${item.rotation}deg)`;
}

function renderBoardStatus() {
  const ended = connectionState === "ended";
  loading.hidden = hasSnapshot || ended;
  world.setAttribute("aria-busy", String(!loading.hidden));
  empty.hidden = !hasSnapshot || ended || items.size > 0;
}

function renderItems() {
  for (const item of items.values()) renderItem(item);
  for (const id of elements.keys()) if (!items.has(id)) removeElement(id);
  renderBoardStatus();
  renderInspector();
  scheduleImageDetail();
}

function renderItem(item: BoardItem) {
  let element = elements.get(item.id);
  const previewKey = item.link ? JSON.stringify(item.link) : "";
  if (element && element.dataset.preview !== previewKey) {
    removeElement(item.id);
    element = undefined;
  }
  if (!element) {
    element = document.createElement("article");
    element.className = "board-item";
    element.dataset.itemId = item.id;
    element.dataset.preview = previewKey;
    if (item.link) {
      element.classList.add("link-item");
      element.appendChild(linkCard(item.id, item.link));
    } else {
      const image = document.createElement("img");
      image.dataset.imageState = "loading";
      image.dataset.src = `/media/${boardId}/${item.assetId}`;
      image.alt = displayFilename(item.filename);
      image.loading = "lazy";
      image.decoding = "async";
      image.draggable = false;
      image.addEventListener("error", () => {
        image.dataset.imageState = "failed";
      });
      const failure = document.createElement("span");
      failure.className = "image-failure";
      failure.textContent = "Image unavailable";
      element.appendChild(image);
      element.appendChild(failure);
    }
    const resize = document.createElement("span");
    resize.className = "resize-handle";
    resize.dataset.action = "resize";
    const rotate = document.createElement("span");
    rotate.className = "rotate-handle";
    rotate.dataset.action = "rotate";
    element.appendChild(resize);
    element.appendChild(rotate);
    const option = new Option(
      item.link?.title || displayFilename(item.filename),
      item.id,
    );
    option.id = `card-option-${item.id}`;
    picker.add(option);
    picker.hidden = false;
    world.appendChild(element);
    elements.set(item.id, element);
    if (didInitialFit) observeImage(element);
  }
  positionElement(element, item);
  element.classList.toggle("selected", selectedId === item.id);
}

function observeImage(element: HTMLElement) {
  if (element.querySelector("img[data-src]")) imageObserver.observe(element);
}

function removeElement(id: string) {
  const element = elements.get(id);
  if (element) {
    imageObserver.unobserve(element);
    const image = element.querySelector("img");
    if (image) boardImages.forget(image);
    element.remove();
  }
  document.getElementById(`card-option-${id}`)?.remove();
  elements.delete(id);
}

function linkCard(itemId: string, link: LinkPreview): HTMLElement {
  const card = document.createElement("div");
  card.className = "link-card";
  if (link.videoUrl) {
    const video = document.createElement("video");
    video.className = "link-card-video";
    video.controls = true;
    video.playsInline = true;
    video.preload = "none";
    video.src = link.videoUrl;
    if (link.imageUrl) video.poster = link.imageUrl;
    video.setAttribute("aria-label", `${displaySiteName(link)} video`);
    video.addEventListener("error", () => {
      video.remove();
      if (link.imageUrl) {
        const image = document.createElement("img");
        image.className = "link-card-image";
        image.src = link.imageUrl;
        image.alt = `${displaySiteName(link)} video unavailable`;
        image.referrerPolicy = "no-referrer";
        card.appendChild(image);
      } else card.appendChild(linkFallback(link));
    });
    card.appendChild(video);
  } else if (link.imageUrl) {
    const image = document.createElement("img");
    image.className = "link-card-image";
    image.alt = displaySiteName(link);
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.draggable = false;
    image.addEventListener("load", () => {
      const element = card.closest<HTMLElement>(".board-item");
      const current = items.get(itemId);
      if (element && current) positionElement(element, current);
    });
    image.addEventListener("error", () => {
      if (image.src.startsWith("blob:") && image.dataset.original) {
        image.src = image.dataset.original;
        return;
      }
      image.remove();
      card.appendChild(linkFallback(link));
      const element = card.closest<HTMLElement>(".board-item");
      const current = items.get(itemId);
      if (element && current) positionElement(element, current);
    });
    image.dataset.imageState = "loading";
    image.dataset.src = link.imageUrl;
    card.appendChild(image);
  } else {
    card.appendChild(linkFallback(link));
  }
  return card;
}

function linkFallback(link: LinkPreview): HTMLElement {
  const body = document.createElement("div");
  body.className = "link-card-body";
  const site = document.createElement("span");
  site.className = "link-card-site";
  site.textContent = displaySiteName(link);
  const title = document.createElement("strong");
  title.className = "link-card-title";
  title.textContent = displaySiteName(link) === "Twitter" ? "Post" : link.title;
  body.appendChild(site);
  body.appendChild(title);
  return body;
}

function renderInspector() {
  const returnFocus =
    !selectedId && inspectorPanel.contains(document.activeElement);
  picker.hidden = !items.size;
  picker.value = selectedId ?? "";
  const changed = inspector.dataset.itemId !== (selectedId ?? "");
  renderItemInspector(
    inspectorPanel,
    inspector,
    selectedId ? (items.get(selectedId) ?? null) : null,
    boardId,
    removeSelected,
    refreshSelectedLink,
  );
  if (returnFocus)
    (picker.hidden ? viewport : picker).focus({ preventScroll: true });
  if (changed && selectedId && !drag) revealSelected();
}

async function postBoardForm(resource: "assets" | "links", body: FormData) {
  if (connectionState === "ended") throw new Error("Board access ended");
  const response = await fetch(`/api/boards/${boardId}/${resource}`, {
    method: "POST",
    body,
  });
  if (!response.ok) throw new Error(await response.text());
  return response;
}

async function refreshSelectedLink(): Promise<void> {
  const link = selectedId ? items.get(selectedId)?.link : null;
  if (!link) return;
  const form = new FormData();
  form.set("url", link.url);
  form.set("refresh", "1");
  toast("Refreshing preview…");
  try {
    await postBoardForm("links", form);
    await refreshSnapshot();
    toast("Preview refreshed");
  } catch (error) {
    toast(error instanceof Error ? error.message : "Could not refresh preview");
  }
}

function select(id: string | null) {
  if (selectedId !== id) {
    if (selectedId) elements.get(selectedId)?.classList.remove("selected");
    if (id) elements.get(id)?.classList.add("selected");
  }
  selectedId = id;
  renderInspector();
}

function updateZoomLabel() {
  zoomLabelTimer = 0;
  lastZoomLabelAt = performance.now();
  const value = `${Math.round(view.camera.scale * 100)}%`;
  if (zoomLabel.textContent !== value) zoomLabel.textContent = value;
}
function scheduleZoomLabel() {
  const remaining = 100 - (performance.now() - lastZoomLabelAt);
  if (remaining <= 0) {
    clearTimeout(zoomLabelTimer);
    updateZoomLabel();
  } else if (!zoomLabelTimer) {
    zoomLabelTimer = window.setTimeout(updateZoomLabel, remaining);
  }
}
function scheduleImageDetail() {
  clearTimeout(imageDetailTimer);
  imageDetailTimer = window.setTimeout(() => {
    const rect = viewport.getBoundingClientRect();
    const { scale, offsetX, offsetY } = view.camera;
    const left = (-offsetX - 160) / scale;
    const top = (-offsetY - 160) / scale;
    const right = (rect.width - offsetX + 160) / scale;
    const bottom = (rect.height - offsetY + 160) / scale;
    for (const [id, element] of elements) {
      const image = element.querySelector("img");
      const item = items.get(id);
      if (!image?.dataset.original || !item) continue;
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      const radius = Math.hypot(item.width, item.height) / 2;
      const visible =
        centerX + radius >= left &&
        centerX - radius <= right &&
        centerY + radius >= top &&
        centerY - radius <= bottom;
      boardImages.setDetail(image, scale > 1.35 && visible);
    }
  }, 160);
}
function shift(start: number, end: number, min: number, max: number): number {
  if (end - start > max - min) return (min + max - start - end) / 2;
  if (start < min) return min - start;
  if (end > max) return max - end;
  return 0;
}

function revealSelected() {
  if (!selectedId || drag || !matchMedia("(max-width: 760px)").matches) return;
  const id = selectedId;
  requestAnimationFrame(() => {
    if (selectedId !== id) return;
    const element = elements.get(id);
    if (!element) return;
    const board = viewport.getBoundingClientRect();
    const item = element.getBoundingClientRect();
    const nextX = shift(
      item.left,
      item.right,
      board.left + 16,
      board.right - 16,
    );
    const nextY = shift(
      item.top,
      item.bottom,
      board.top + 16,
      board.bottom - 16,
    );
    if (!nextX && !nextY) return;
    view.set({
      ...view.camera,
      offsetX: view.camera.offsetX + nextX,
      offsetY: view.camera.offsetY + nextY,
    });
  });
}
function fitBoard() {
  view.fit(items.values(), 65);
}

function placeItem(width: number, height: number, point?: Point): Point {
  const center = worldPoint(
    point ?? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 },
  );
  const stepX = width + 28;
  const stepY = height + 28;
  for (let ring = 0; ring < 10; ring++) {
    const offsets: Point[] =
      ring === 0
        ? [{ x: 0, y: 0 }]
        : [
            { x: ring, y: 0 },
            { x: -ring, y: 0 },
            { x: 0, y: ring },
            { x: 0, y: -ring },
            { x: ring, y: ring },
            { x: -ring, y: ring },
            { x: ring, y: -ring },
            { x: -ring, y: -ring },
          ];
    for (const offset of offsets) {
      const x = center.x - width / 2 + offset.x * stepX;
      const y = center.y - height / 2 + offset.y * stepY;
      if (
        [...items.values()].every(
          (item) =>
            x + width + 20 <= item.x ||
            item.x + item.width + 20 <= x ||
            y + height + 20 <= item.y ||
            item.y + item.height + 20 <= y,
        )
      ) {
        return { x, y };
      }
    }
  }
  return { x: center.x - width / 2, y: center.y - height / 2 };
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 1) return;
  const target = event.target as HTMLElement;
  if (
    target.closest(
      "a, button, input, textarea, select, summary, video, [contenteditable]",
    )
  )
    return;
  viewport.focus({ preventScroll: true });
  const element = target.closest<HTMLElement>(".board-item");
  const item = element ? items.get(element.dataset.itemId!) : null;
  const start = screenPoint(event);
  if (event.button === 1 || spaceHeld || !item) {
    if (!item && !spaceHeld) select(null);
    drag = { kind: "pan", move: view.startPan(event) };
    viewport.classList.add("panning");
  } else {
    if (!canEditItem(item)) {
      select(item.id);
      return;
    }
    const action = target.dataset.action;
    drag = {
      kind:
        action === "resize"
          ? "resize"
          : action === "rotate"
            ? "rotate"
            : "move",
      start,
      original: { ...item },
      moved: false,
    };
    select(item.id);
  }
  viewport.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handlePointerMove(event: PointerEvent) {
  const point = screenPoint(event);
  if (!drag) return;
  if (drag.kind === "pan") {
    drag.move(event);
    return;
  }
  const { scale, offsetX, offsetY } = view.camera;
  const dx = point.x - drag.start.x;
  const dy = point.y - drag.start.y;
  if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
  const original = drag.original;
  const item = items.get(original.id);
  if (!item) return;
  if (drag.kind === "move") {
    item.x = original.x + dx / scale;
    item.y = original.y + dy / scale;
  }
  if (drag.kind === "resize") {
    const horizontal = dx / (original.width * scale);
    const vertical = dy / (original.height * scale);
    const change =
      Math.abs(horizontal) > Math.abs(vertical) ? horizontal : vertical;
    const factor = Math.max(
      48 / original.width,
      48 / original.height,
      1 + change,
    );
    item.width = original.width * factor;
    item.height = original.height * factor;
  }
  if (drag.kind === "rotate") {
    const center = {
      x: (original.x + original.width / 2) * scale + offsetX,
      y: (original.y + original.height / 2) * scale + offsetY,
    };
    const before = Math.atan2(drag.start.y - center.y, drag.start.x - center.x);
    const after = Math.atan2(point.y - center.y, point.x - center.x);
    item.rotation = Math.round(
      original.rotation + ((after - before) * 180) / Math.PI,
    );
  }
  const element = elements.get(item.id);
  if (element) positionElement(element, item);
}

function handlePointerUp(event: PointerEvent) {
  if (!drag) return;
  viewport.releasePointerCapture(event.pointerId);
  viewport.classList.remove("panning");
  const reveal = drag.kind !== "pan" && !drag.moved;
  if (drag.kind !== "pan" && drag.moved) {
    const item = items.get(drag.original.id);
    if (item)
      submit({
        kind: "transform",
        operationId: crypto.randomUUID(),
        itemId: item.id,
        baseRevision: drag.original.revision,
        ...itemGeometry(item),
      });
    renderInspector();
  }
  drag = null;
  if (reveal) revealSelected();
}

function canEditItem(item: BoardItem) {
  if (item.revision > 0) return true;
  toast("Waiting for the board to confirm this card.");
  return false;
}

function removeSelected() {
  if (!selectedId) return;
  const item = items.get(selectedId);
  if (!item || !canEditItem(item)) return;
  submit({
    kind: "remove",
    operationId: crypto.randomUUID(),
    itemId: item.id,
    baseRevision: item.revision,
  });
  items.delete(item.id);
  selectedId = null;
  renderItems();
}

function addBoardItem(
  asset: {
    assetId: string;
    filename: string;
    width: number;
    height: number;
    link?: LinkPreview;
  },
  point?: Point,
) {
  if (connectionState === "ended") throw new Error("Board access ended");
  const position = placeItem(asset.width, asset.height, point);
  const item: BoardItem = {
    id: crypto.randomUUID(),
    assetId: asset.assetId,
    filename: asset.filename,
    ...(asset.link ? { link: asset.link } : {}),
    ...position,
    width: asset.width,
    height: asset.height,
    rotation: 0,
    z: Math.max(0, ...[...items.values()].map((entry) => entry.z)) + 1,
    revision: 0,
  };
  items.set(item.id, item);
  selectedId = item.id;
  renderItems();
  submit({
    kind: "create",
    operationId: crypto.randomUUID(),
    item: {
      id: item.id,
      assetId: item.assetId,
      ...itemGeometry(item),
    },
  });
}

async function uploadFiles(files: FileList | File[]) {
  const list = [...files].filter((file) => file.type.startsWith("image/"));
  if (!list.length) {
    toast("Choose a PNG, JPEG, GIF, or WebP image.");
    return;
  }
  for (const file of list) {
    if (file.size > 20 * 1024 * 1024) {
      toast(`${file.name} is larger than 20 MB.`);
      continue;
    }
    try {
      toast(`Adding ${file.name}…`);
      const dimensions = await imageDimensions(file);
      const form = new FormData();
      form.set("file", file);
      const response = await postBoardForm("assets", form);
      const uploaded = (await response.json()) as {
        assetId: string;
        filename: string;
      };
      const width = Math.min(460, Math.max(180, dimensions.width));
      const height = Math.max(
        80,
        (width * dimensions.height) / dimensions.width,
      );
      addBoardItem({ ...uploaded, width, height });
      toast(`Added ${file.name}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not add image");
    }
  }
  fileInput.value = "";
}

async function addLink(url: string, point?: Point) {
  const form = new FormData();
  form.set("url", url);
  try {
    toast("Adding link…");
    const response = await postBoardForm("links", form);
    const saved = (await response.json()) as {
      assetId: string;
      preview: LinkPreview;
      existingItemId: string | null;
    };
    if (saved.existingItemId) {
      await refreshSnapshot();
      select(saved.existingItemId);
      toast("Already on this board");
      return;
    }
    const dimensions = saved.preview.imageUrl
      ? await imageDimensionsFromUrl(saved.preview.imageUrl).catch(() => null)
      : null;
    const ratio = dimensions ? dimensions.width / dimensions.height : null;
    const useRatio = ratio !== null && ratio >= 0.04 && ratio <= 15;
    const width = useRatio ? Math.min(360, 600 * ratio) : 360;
    const height = useRatio ? width / ratio : 220;
    addBoardItem(
      {
        assetId: saved.assetId,
        filename: saved.preview.title,
        link: saved.preview,
        width,
        height,
      },
      point,
    );
    linkMenu.open = false;
    linkInput.value = "";
    toast("Link added");
  } catch (error) {
    toast(error instanceof Error ? error.message : "Could not add link");
  }
}

function pastedUrl(value: string): string | null {
  const text = value.trim();
  if (!/^https?:\/\/\S+$/i.test(text)) return null;
  try {
    return new URL(text).href;
  } catch {
    return null;
  }
}

function imageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    });
    image.src = url;
  });
}

function imageDimensionsFromUrl(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(
      () => reject(new Error("Could not read link image")),
      4000,
    );
    image.addEventListener("load", () => {
      clearTimeout(timeout);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    });
    image.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Could not read link image"));
    });
    image.src = src;
  });
}

viewport.addEventListener("pointerdown", handlePointerDown);
viewport.addEventListener("pointermove", handlePointerMove);
viewport.addEventListener("pointerup", handlePointerUp);
viewport.addEventListener("pointercancel", handlePointerUp);
viewport.addEventListener("dragover", (event) => {
  event.preventDefault();
  viewport.classList.add("drag-over");
});
viewport.addEventListener("dragleave", () =>
  viewport.classList.remove("drag-over"),
);
viewport.addEventListener("drop", (event) => {
  event.preventDefault();
  viewport.classList.remove("drag-over");
  if (event.dataTransfer?.files.length) {
    void uploadFiles(event.dataTransfer.files);
    return;
  }
  const uri = event.dataTransfer
    ?.getData("text/uri-list")
    .split("\n")
    .find((line) => line && !line.startsWith("#"));
  const url = pastedUrl(uri || event.dataTransfer?.getData("text/plain") || "");
  if (url) void addLink(url, screenPoint(event));
});
document.addEventListener("paste", (event) => {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  )
    return;
  if (event.clipboardData?.files.length) {
    void uploadFiles(event.clipboardData.files);
    return;
  }
  const url = pastedUrl(event.clipboardData?.getData("text/plain") ?? "");
  if (url) {
    event.preventDefault();
    void addLink(url);
  }
});
viewport.addEventListener("keydown", (event) => {
  if (event.target !== viewport) return;
  if (event.code === "Space") {
    event.preventDefault();
    spaceHeld = true;
  }
  if (event.key === "Delete" || event.key === "Backspace") removeSelected();
  if (event.key === "Escape") select(null);
});
viewport.addEventListener("focusout", () => {
  spaceHeld = false;
});
document.addEventListener("keyup", (event) => {
  if (event.code === "Space") spaceHeld = false;
});
window.addEventListener("blur", () => {
  spaceHeld = false;
});
required("#tool-fit").addEventListener("click", fitBoard);
required("#zoom-in").addEventListener("click", () =>
  zoomAt(1.2, { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }),
);
required("#zoom-out").addEventListener("click", () =>
  zoomAt(1 / 1.2, {
    x: viewport.clientWidth / 2,
    y: viewport.clientHeight / 2,
  }),
);
// After choosing a card, Tab skips the unrelated canvas tools to its details.
picker.addEventListener("keydown", (event) => {
  if (
    event.key === "Tab" &&
    !event.shiftKey &&
    selectedId &&
    !inspectorPanel.hidden
  ) {
    event.preventDefault();
    required<HTMLButtonElement>("#inspector-close").focus();
  }
});
picker.addEventListener("change", () => select(picker.value || null));
required("#inspector-close").addEventListener("click", () => select(null));
window.addEventListener("resize", revealSelected);
required("#tool-add").addEventListener("click", () => fileInput.click());
linkForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void addLink(linkInput.value);
});
document
  .querySelector("#empty-add")
  ?.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files) void uploadFiles(fileInput.files);
});
connect();
