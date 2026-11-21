import {
  webSocketLink,
  type WebSocketLike,
} from "../../pi/compat/packages/chord/src/index.ts";
import { WebSocket } from "ws";
import { Sessions, type Session } from "../../pi/plugins/sessions/contract.ts";
import {
  BACKGROUND_CONTEXT,
  withAbortSignal,
} from "../../pi/src/api/v1/index.ts";
import { createHost } from "../../pi/src/runtime/chord.ts";
import { SERVER } from "../../pi/src/runtime/principals.ts";
import { clientLinkPath } from "../../pi/src/runtime/stale-page.ts";
import type { OverviewRow } from "../app/overview-layout.ts";

function snapshot(sessions: readonly Session[]) {
  const rows: OverviewRow[] = [];
  for (const { id, title, createdAt, main, branches, archivedAt } of sessions) {
    if (archivedAt !== null) continue;
    if (rows.length >= 256 || branches.length > 128)
      throw Error("Catalog too large");
    rows.push({
      id,
      title,
      createdAt,
      main,
      branches: branches.map(({ conversation, label, parent }) => ({
        conversation,
        label,
        ...(parent === undefined ? {} : { parent }),
      })),
    });
  }
  const json = JSON.stringify(rows);
  if (Buffer.byteLength(json) > 192 * 1024) throw Error("Catalog too large");
  return json;
}

/** Ends rather than reusing the Pi credential if the authenticated upstream link is lost. */
export async function followCatalog(
  port: number,
  cookie: string,
  publish: (json: string) => void,
  unavailable: () => void,
) {
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}${clientLinkPath("script")}`,
    {
      headers: { Cookie: cookie },
      handshakeTimeout: 5000,
      maxPayload: 4 * 1024 * 1024,
      perMessageDeflate: false,
      followRedirects: false,
    },
  );
  const closed = new AbortController();
  const end = () => {
    unavailable();
    closed.abort();
  };
  socket.on("error", end);
  socket.once("close", end);
  const host = createHost({ onError: () => {} });
  const lifetime = closed.signal;
  const ctx = withAbortSignal(lifetime, BACKGROUND_CONTEXT);
  host.connect(
    webSocketLink(socket as unknown as WebSocketLike),
    { principal: SERVER },
    ctx,
  );
  try {
    await host.load([], ctx);
    await host.root(async (scope) => {
      const ref = await scope.get(Sessions, {});
      if (ref.variant !== "owner") throw Error("Pi owner Sessions required");
      const binding = await ref.state.watch(scope);
      const catalog = await ref.sessions.watch(scope);
      try {
        const authorized = () =>
          !lifetime.aborted &&
          ref.state.value.kind === "live" &&
          ref.variant === "owner";
        if (!authorized() || binding.value.kind !== "live")
          throw Error("Pi binding ended");
        binding.start(async (call) => {
          if (call.kind !== "value" || call.value.kind !== "live") end();
        });
        publish(snapshot(catalog.value));
        catalog.start(async (call) => {
          if (call.kind !== "value" || call.retired || !authorized())
            return end();
          try {
            publish(snapshot(call.value));
          } catch {
            end();
          }
        });
        await Promise.race([binding.closed, catalog.closed]);
      } finally {
        unavailable();
        await Promise.all([catalog.stop(), binding.stop()]);
      }
    }, ctx);
  } finally {
    socket.terminate();
    await host.close(BACKGROUND_CONTEXT);
  }
}
