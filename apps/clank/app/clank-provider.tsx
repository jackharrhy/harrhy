import type { Handle, RemixNode } from "remix/component";
import { newWebSocketRpcSession, type RpcStub } from "capnweb";
import type { SessionApi } from "./session-api.ts";
import { apply, emptyIndex, MAX_BYTES, type View } from "./session-state.ts";
import { createSessionStore } from "./session-store.ts";

type App = {
  sessions: Pick<ReturnType<typeof createSessionStore>, "select"> & {
    create(title: string): Promise<void>;
    rename(id: string, title: string): Promise<void>;
    archive(id: string): Promise<void>;
  };
};

/** One page-local binding. Consumers never own an RPC stub or a retry timer. */
export function ClankProvider(handle: Handle<{ children?: RemixNode }, App>) {
  const sessions = createSessionStore();
  const pending = sessions.select((s) => s.pending);
  let view: View | undefined,
    socket: WebSocket | undefined,
    catalog: RpcStub<SessionApi> | undefined;
  let retry: ReturnType<typeof setTimeout>,
    delay = 300;

  function connect() {
    const ws = new WebSocket(new URL("/live", location.href));
    socket = ws;
    const deadline = setTimeout(() => ws.close(4001, "Bind timeout"), 10_000);
    const api = newWebSocketRpcSession<SessionApi>(ws, undefined, {
      limits: { maxMessageSize: MAX_BYTES * 2, maxDepth: 32 },
    });
    catalog = api;
    void api
      .watch(async (frame) => {
        if (ws !== socket || handle.signal.aborted)
          throw Error("Binding ended");
        try {
          view = apply(view, frame);
          delay = 300;
          clearTimeout(deadline);
          await sessions.publish({
            byId: view.byId,
            activeRows: view.activeRows,
            archivedRows: view.archivedRows,
            status: "live",
          });
        } catch (error) {
          ws.close(4001, "Invalid session state");
          throw error;
        }
      })
      .catch(() => ws.close(4001, "Watch unavailable"));
    ws.addEventListener("close", () => {
      clearTimeout(deadline);
      api[Symbol.dispose]();
      if (ws !== socket || handle.signal.aborted) return;
      socket = undefined;
      catalog = undefined;
      view = undefined;
      void sessions.publish({
        ...emptyIndex,
        status: "disconnected",
        pending: false,
        ...(pending.current
          ? {
              notice:
                "Command outcome unknown. Check the refreshed list before retrying.",
            }
          : {}),
      });
      retry = setTimeout(connect, delay);
      delay = Math.min(5000, delay * 2);
    });
  }
  function stop() {
    clearTimeout(retry);
    const ws = socket;
    socket = undefined;
    catalog = undefined;
    ws?.close();
  }
  handle.queueTask(() => {
    if (handle.signal.aborted) return;
    connect();
    handle.signal.addEventListener("abort", stop, { once: true });
    window.addEventListener("pagehide", stop, { signal: handle.signal });
    window.addEventListener(
      "pageshow",
      (e) => {
        if (e.persisted) location.reload();
      },
      { signal: handle.signal },
    );
  });
  async function send(
    command: (api: SessionApi, epoch: string) => Promise<void>,
  ) {
    const api = catalog;
    if (
      !view ||
      !api ||
      pending.current ||
      socket?.readyState !== WebSocket.OPEN
    )
      return;
    void sessions.publish({ pending: true, notice: "" });
    let notice = "";
    try {
      await command(api, view.epoch);
    } catch {
      notice = "Command refused by Pi.";
    }
    if (api === catalog && socket?.readyState === WebSocket.OPEN)
      await sessions.publish({ pending: false, notice });
  }
  handle.context.set({
    sessions: {
      select: sessions.select,
      create: (title) => send((api, epoch) => api.create(epoch, title)),
      rename: (id, title) => send((api, epoch) => api.rename(epoch, id, title)),
      archive: (id) => send((api, epoch) => api.archive(epoch, id)),
    },
  });
  return () => handle.props.children;
}
