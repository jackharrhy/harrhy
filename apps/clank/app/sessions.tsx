import { clientEntry, on, type Handle } from "remix/component";
import { newWebSocketRpcSession, type RpcStub } from "capnweb";
import type { SessionApi } from "./session-api.ts";
import { apply, MAX_BYTES, type View } from "./session-state.ts";

export const SessionList = clientEntry(
  "/sessions.js#SessionList",
  function SessionList(handle: Handle) {
    let view: View | undefined, socket: WebSocket | undefined;
    let catalog: RpcStub<SessionApi> | undefined;
    let retry: ReturnType<typeof setTimeout>,
      delay = 300;
    let status = "Connecting…",
      pending = false,
      notice = "",
      archived = false;
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
            status = "Live";
            delay = 300;
            clearTimeout(deadline);
            await handle.update();
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
        if (pending)
          notice =
            "Command outcome unknown. Check the refreshed list before retrying.";
        pending = false;
        status = "Disconnected. Reconnecting…";
        handle.update();
        retry = setTimeout(connect, delay);
        delay = Math.min(5000, delay * 2);
      });
    }
    const stop = () => {
      clearTimeout(retry);
      const ws = socket;
      socket = undefined;
      ws?.close();
    };
    handle.queueTask(() => {
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
      if (!view || !api || pending || socket?.readyState !== WebSocket.OPEN)
        return;
      pending = true;
      notice = "";
      handle.update();
      try {
        await command(api, view.epoch);
      } catch {
        if (api === catalog && socket?.readyState === WebSocket.OPEN)
          notice = "Command refused by Pi.";
      } finally {
        // A disconnected write has unknown outcome. Its close handler owns that transition.
        if (api === catalog && socket?.readyState === WebSocket.OPEN) {
          pending = false;
          handle.update();
        }
      }
    }
    function titleForm(id?: string) {
      const action = id ? "Rename" : "Create";
      return (
        <form
          mix={on("submit", (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const title = String(new FormData(form).get("title") ?? "").trim();
            if (title)
              void send((api, epoch) =>
                id ? api.rename(epoch, id, title) : api.create(epoch, title),
              );
          })}
        >
          <label>
            {id ? "New title" : "Session title"}{" "}
            <input name="title" required maxLength={120} />
          </label>{" "}
          <button disabled={!view || pending}>{action}</button>
        </form>
      );
    }
    return () => {
      const rows = [...(view?.rows.values() ?? [])]
        .filter((row) => (row.archivedAt !== null) === archived)
        .toSorted(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            b.updatedAt - a.updatedAt ||
            a.id.localeCompare(b.id),
        );
      return (
        <section>
          <p role="status">{status}</p>
          {notice && <p role="alert">{notice}</p>}
          {titleForm()}
          <h2>{archived ? "Archive" : "Active sessions"}</h2>
          <button
            mix={on("click", () => {
              archived = !archived;
              handle.update();
            })}
          >
            {archived ? "Show active" : "Show archive"}
          </button>
          {view && !rows.length && (
            <p>No {archived ? "archived" : "active"} sessions.</p>
          )}
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <h3>{row.title || "Untitled session"}</h3>
                <p>
                  {row.pinned ? "Pinned · " : ""}
                  {row.model.provider}/{row.model.modelId} · {row.thinkingLevel}
                </p>
                <details>
                  <summary>Session details</summary>
                  <p>
                    {row.env ?? "Local"} · {row.cwd}
                  </p>
                  <p>
                    Created {new Date(row.createdAt).toISOString()} · Updated{" "}
                    {new Date(row.updatedAt).toISOString()}
                  </p>
                  <p>Main conversation {row.main}</p>
                  <ul>
                    {row.branches.map((b) => (
                      <li key={b.conversation}>
                        {b.conversation}: {b.label ?? row.title}
                        {b.parent ? ` (from ${b.parent})` : ""}
                      </li>
                    ))}
                  </ul>
                  {row.archivedAt !== null && (
                    <p>Archived {new Date(row.archivedAt).toISOString()}</p>
                  )}
                </details>
                {!archived && (
                  <>
                    {titleForm(row.id)}
                    <button
                      disabled={pending}
                      mix={on("click", () =>
                        send((api, epoch) => api.archive(epoch, row.id)),
                      )}
                    >
                      Archive
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      );
    };
  },
);
