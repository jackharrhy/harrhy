import { clientEntry, on, type Handle } from "remix/component";
import { apply, type Command, type View } from "./session-state.ts";

export const SessionList = clientEntry(
  "/sessions.js#SessionList",
  function SessionList(handle: Handle) {
    let view: View | undefined, socket: WebSocket | undefined;
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
      ws.onmessage = async (event) => {
        if (ws !== socket) return;
        try {
          const message = JSON.parse(event.data);
          if (message.kind === "result") {
            pending = false;
            notice = message.ok ? "" : "Command refused by Pi.";
          } else {
            view = apply(view, message);
            status = "Live";
            delay = 300;
            clearTimeout(deadline);
            await handle.update();
            if (ws === socket && ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ kind: "ack", epoch: message.epoch, seq: message.seq }));
            return;
          }
          handle.update();
        } catch {
          ws.close(4001, "Invalid session state");
        }
      };
      ws.onclose = () => {
        clearTimeout(deadline);
        if (ws !== socket || handle.signal.aborted) return;
        socket = undefined;
        view = undefined;
        if (pending) notice = "Command outcome unknown. Check the refreshed list before retrying.";
        pending = false;
        status = "Disconnected. Reconnecting…";
        handle.update();
        retry = setTimeout(connect, delay);
        delay = Math.min(5000, delay * 2);
      };
    }
    handle.queueTask(() => {
      connect();
      const stop = () => {
        clearTimeout(retry);
        const ws = socket;
        socket = undefined;
        ws?.close();
      };
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
    function send(command: Command) {
      if (!view || pending || socket?.readyState !== WebSocket.OPEN) return;
      pending = true;
      notice = "";
      socket.send(JSON.stringify({ ...command, epoch: view.epoch }));
      handle.update();
    }
    function titleForm(id?: string) {
      const action = id ? "Rename" : "Create";
      return (
        <form
          mix={on("submit", (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const title = String(new FormData(form).get("title") ?? "").trim();
            if (title) send(id ? { kind: "rename", id, title } : { kind: "create", title });
          })}
        >
          <label>
            {id ? "New title" : "Session title"} <input name="title" required maxLength={120} />
          </label>{" "}
          <button disabled={!view || pending}>{action}</button>
        </form>
      );
    }
    return () => {
      const rows = [...(view?.rows.values() ?? [])]
        .filter((row) => (row.archivedAt !== null) === archived)
        .sort(
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
          {view && !rows.length && <p>No {archived ? "archived" : "active"} sessions.</p>}
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
                      mix={on("click", () => send({ kind: "archive", id: row.id }))}
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
