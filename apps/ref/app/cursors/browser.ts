import { newWebSocketRpcSession } from "capnweb";
import type { Cursor, LiveBoardApi, Position } from "./api.ts";
import { watch } from "@harrhy/live-state/watch";

export function openLiveBoard(
  boardId: string,
  viewport: HTMLElement,
  world: HTMLElement,
  position: (event: PointerEvent) => Position,
) {
  const layer = document.createElement("div");
  layer.className = "remote-cursors";
  layer.setAttribute("aria-hidden", "true");
  world.appendChild(layer);
  const ws = new WebSocket(
    `${location.origin.replace(/^http/, "ws")}/api/boards/${boardId}/canvas/live`,
  );
  const api = newWebSocketRpcSession<LiveBoardApi>(ws);
  const view = watch<Cursor>((items) => {
    layer.replaceChildren(
      ...(items ?? []).map((cursor) => {
        const mark = document.createElement("i");
        mark.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
        mark.style.color = `hsl(${parseInt(cursor.id.slice(0, 4), 16) % 360} 65% 38%)`;
        return mark;
      }),
    );
  });
  let pending: Position | null | undefined;
  let busy = false;
  let ready = false;
  void view.reconnect(api, `board:${boardId}/canvas`).then(
    () => {
      ready = true;
    },
    () => ws.close(),
  );
  const events = new AbortController();
  viewport.addEventListener(
    "pointermove",
    (event) => {
      pending = position(event);
    },
    { signal: events.signal },
  );
  viewport.addEventListener(
    "pointerleave",
    () => {
      pending = null;
    },
    { signal: events.signal },
  );
  const tick = setInterval(async () => {
    if (!ready || busy || pending === undefined) return;
    const point = pending;
    pending = undefined;
    busy = true;
    try {
      await api.move(point);
    } catch {
      ws.close();
    } finally {
      busy = false;
    }
  }, 150);
  function stop() {
    if (events.signal.aborted) return;
    events.abort();
    clearInterval(tick);
    void view.dispose();
    layer.remove();
    ws.close();
    api[Symbol.dispose]();
  }
  ws.addEventListener("close", stop, { once: true });
  return {
    stop,
    get connected() {
      return ws.readyState === WebSocket.OPEN;
    },
    async rename(title: string) {
      const timeout = setTimeout(() => ws.close(), 10000);
      try {
        return await api.rename(title);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
