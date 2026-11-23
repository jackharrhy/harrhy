import { newWebSocketRpcSession, RpcTarget, type RpcStub } from "capnweb";
import { channel } from "@harrhy/live-state/channel";
import type { Frame, Sink } from "@harrhy/live-state/watch";
import type { Position } from "./deck.ts";

// Standard (non-hibernating) socket. Sample the committed snapshot on the
// reader's lifetime, not the presenter's request, which can end before an ack.
export function viewerSession(
  read: () => Position,
  release: () => void,
  ctx: DurableObjectState,
) {
  const pair = new WebSocketPair(),
    ws = pair[1];
  ws.accept();
  let key: string | undefined,
    sub: ReturnType<typeof channel<Position>> | undefined;
  let sampled = -1,
    closed = false;
  const startBy = Date.now() + 5000;
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(tick);
    release();
    sub?.stop();
    ws.close(1000, "Viewer session ended");
  }
  function next(after: number | null): { frame: Frame<Position> } {
    const state = read(),
      at = state.cursor;
    if (after !== null && after > at) return { frame: { kind: "reset" } };
    return {
      frame:
        after === at
          ? { kind: "same", at }
          : { kind: "snapshot", at, items: [state] },
    };
  }
  const tick = setInterval(() => {
    if (!sub) {
      if (Date.now() >= startBy) close();
      return;
    }
    if (sub.due && Date.now() >= sub.due) return close();
    const at = read().cursor;
    if (sampled !== at) {
      sampled = at;
      ctx.waitUntil(sub.wake());
    }
  }, 150);
  class Published extends RpcTarget {
    start(id: string, after: number | null, sink: RpcStub<Sink<Position>>) {
      if (
        closed ||
        key ||
        typeof id !== "string" ||
        id.length !== 36 ||
        (after !== null && (!Number.isSafeInteger(after) || after < 0))
      )
        throw Error("Invalid viewer watch");
      key = id;
      sampled = read().cursor;
      sub = channel(
        after,
        sink,
        next,
        () => {},
        close,
        () => {},
      );
      return sub.wake();
    }
    stop(id: string) {
      if (id === key) close();
    }
  }
  const root = newWebSocketRpcSession(ws, new Published(), {
    limits: { maxMessageSize: 4096, maxDepth: 16 },
  });
  ws.addEventListener(
    "close",
    () => {
      close();
      root[Symbol.dispose]();
    },
    { once: true },
  );
  ws.addEventListener("error", close, { once: true });
  return new Response(null, { status: 101, webSocket: pair[0] });
}
