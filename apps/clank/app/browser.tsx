import { createRoot } from "remix/component";
import { Badge } from "@harrhy/ui/native";
import { createHost, webSocketLink } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Sessions } from "../../pi/plugins/sessions/contract.ts";

const container = document.getElementById("clank-sessions");
if (!container) throw new Error("Missing sessions container");
container.replaceChildren();
const root = createRoot(container);
root.render(<p>Connecting to Pi…</p>);
const ctx = BACKGROUND_CONTEXT;
let stopped = false;
let retry: ReturnType<typeof setTimeout>;
let close = () => {};

function connect() {
  const url = new URL("/chord?client=cloud", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url);
  const host = createHost({
    onError: () => {
      if (!stopped) root.render(<p role="alert">Pi connection error.</p>);
    },
  });
  close = () => socket.close();
  socket.addEventListener("open", () => {
    host.connect(webSocketLink(socket), { principal: { kind: "server" } }, ctx);
    void host.load([], ctx);
    void host
      .root(async (scope) => {
        const sessions = await scope.get(Sessions, {});
        if (sessions.variant !== "owner") throw new Error("Owner access required");
        const watch = await sessions.sessions.watch(scope);
        try {
          const rows = watch.value.filter((row) => row.archivedAt === null);
          if (stopped || socket.readyState !== WebSocket.OPEN) return;
          root.render(
            rows.length ? (
              <ul>
                {rows.map((row) => (
                  <li key={row.id}>{row.title || "Untitled session"}</li>
                ))}
              </ul>
            ) : (
              <p>No sessions.</p>
            ),
          );
        } finally {
          watch.stop();
        }
      }, ctx)
      .catch(() => {
        if (!stopped && socket.readyState === WebSocket.OPEN) {
          root.render(
            <p role="alert">
              Pi session list unavailable. Check access and contract compatibility.
            </p>,
          );
        }
      });
  });
  socket.addEventListener("close", () => {
    void host.close(ctx);
    if (stopped) return;
    root.render(<Badge>Disconnected. Reconnecting…</Badge>);
    retry = setTimeout(connect, 2000);
  });
}

connect();
window.addEventListener("pagehide", () => {
  stopped = true;
  clearTimeout(retry);
  close();
  root.dispose();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
