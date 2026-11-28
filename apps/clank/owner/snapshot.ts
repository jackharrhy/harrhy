import { cacheHitRate } from "../../pi/src/runtime/conversation-stats.ts";
import { startSnapshotBranding, type Branding } from "./branding.ts";
import { ownerSessions } from "./session-wire.ts";
import { sidebarActivity } from "./sidebar-activity.ts";
import type { IncomingMessage } from "node:http";
import WebSocket from "ws";
import { webSocketLink, type WebSocketLike } from "@earendil-works/chord";
import {
  BACKGROUND_CONTEXT,
  withAbortSignal,
} from "@earendil-works/chord/context";
import { Chat } from "../../pi/plugins/chat/contract.ts";
import { Subagents } from "../../pi/plugins/subagents/contract.ts";
import { Access } from "../../pi/src/runtime/access.ts";
import { createHost } from "../../pi/src/runtime/chord.ts";
import { SERVER } from "../../pi/src/runtime/principals.ts";
import { activeRows, type Snapshot } from "./catalog.ts";
import {
  CHORD_PATH,
  findSession,
  sessionKey,
  canonicalSessionRedirect,
} from "./routes.ts";

const metadata = [
  "origin",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
] as const;
let pending = 0;

function boundedSnapshot(
  snapshot: Snapshot,
  branding?: Branding,
): Snapshot | undefined {
  const remaining = 512 * 1024 - Buffer.byteLength(JSON.stringify(snapshot));
  if (remaining < 0) return;
  if (!branding) return snapshot;

  const fieldBytes = (value: Branding) =>
    Buffer.byteLength(',"branding":' + JSON.stringify(value));
  // JSON counts the seed's copy. Reserve three more URLs for a favicon,
  // sidebar mark and familiar row in the server-rendered markup.
  if (fieldBytes(branding) + 3 * (branding.logo?.length ?? 0) <= remaining)
    return { ...snapshot, branding };
  const withoutLogo = { ...branding, logo: null };
  if (fieldBytes(withoutLogo) <= remaining)
    return { ...snapshot, branding: withoutLogo };
  return snapshot;
}

export async function readSnapshot(
  port: number,
  ownerHost: string,
  request: IncomingMessage,
  familiar: string | undefined,
  disconnected: AbortSignal,
): Promise<Snapshot | undefined> {
  const { headers } = request;
  if (
    pending >= 4 ||
    disconnected.aborted ||
    headers.host !== ownerHost ||
    (headers.origin !== undefined &&
      headers.origin !== `https://${ownerHost}`) ||
    (headers["sec-fetch-site"] !== undefined &&
      !["same-origin", "none"].includes(headers["sec-fetch-site"])) ||
    (headers["sec-fetch-mode"] !== undefined &&
      headers["sec-fetch-mode"] !== "navigate") ||
    (headers["sec-fetch-dest"] !== undefined &&
      headers["sec-fetch-dest"] !== "document")
  )
    return;
  // Forward only the native device-cookie slot. Pi verifies signature, expiry, revocation and remote authority.
  const cookieKey = `p2_owner_${port}=`;
  const cookies = headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(cookieKey));
  if (
    cookies?.length !== 1 ||
    !/^[a-f0-9]{32}\.\d{1,16}\.[a-f0-9]{64}$/.test(
      cookies[0].slice(cookieKey.length),
    )
  )
    return;
  const signal = AbortSignal.any([disconnected, AbortSignal.timeout(1800)]);
  const upstream: Record<string, string> = {
    Host: ownerHost,
    Cookie: cookies[0],
    "x-p2-proxy-secret": "clank-preview",
  };
  for (const name of metadata)
    if (typeof headers[name] === "string") upstream[name] = headers[name];
  const socket = new WebSocket(`ws://127.0.0.1:${port}${CHORD_PATH}`, {
    headers: upstream,
    maxPayload: 4 * 1024 * 1024,
    handshakeTimeout: 1500,
    perMessageDeflate: false,
    followRedirects: false,
  });
  pending++;
  const ended = new AbortController();
  const stop = () => ended.abort();
  socket.on("error", stop);
  socket.on("close", stop);
  const lifetime = AbortSignal.any([signal, ended.signal]);
  const terminate = () => socket.terminate();
  signal.addEventListener("abort", terminate, { once: true });
  const host = createHost({ onError: () => {} });
  const ctx = withAbortSignal(lifetime, BACKGROUND_CONTEXT);
  try {
    host.connect(
      webSocketLink(socket as unknown as WebSocketLike),
      {
        principal: SERVER,
        limits: { part: 4 * 1024 * 1024, decoded: 4 * 1024 * 1024 },
      },
      ctx,
    );
    await host.load([], ctx);
    return await host.root(async (scope) => {
      const access = await scope.get(Access, {});
      if (access.variant !== "owner") return;
      const { ref: sessions } = await ownerSessions(scope);
      const catalog = await sessions.sessions.watch(scope);
      const rows = activeRows(catalog.value);
      const key = sessionKey(request.url ?? "");
      const selected = key
        ? findSession(rows, key)
        : (rows.find((row) => row.id === familiar) ?? rows[0]);
      const authorized = () =>
        !lifetime.aborted &&
        access.variant === "owner" &&
        access.state.value.kind === "live" &&
        sessions.variant === "owner" &&
        sessions.state.value.kind === "live";
      if (!authorized()) return;
      if (canonicalSessionRedirect(key, selected) && selected) {
        return boundedSnapshot({
          rows: [selected],
          children: {},
          selectedId: selected.id,
        });
      }
      const brandingNow = startSnapshotBranding(scope);
      const agents = await scope.get(Subagents, {});
      const children =
        agents.variant === "reader"
          ? (await agents.children.watch(scope)).value
          : {};
      const snapshot: Snapshot = { rows, children, selectedId: selected?.id };
      snapshot.activeIds = await sidebarActivity(
        scope,
        sessions.operations,
      ).catch(() => []);
      if (selected) {
        const chat = await scope.get(Chat, {
          session: selected.id,
          conversation: selected.main,
        });
        if (chat.variant === "participant") {
          const [view, model, stats] = await Promise.all([
            chat.view.watch(scope),
            chat.model.watch(scope),
            chat.stats.watch(scope),
          ]);
          const value = view.value;
          snapshot.chat = {
            view: value && {
              ...value,
              docs: Object.fromEntries(
                Object.entries(value.docs).filter(
                  ([name]) => name === "pi.agent" || name === "pi.live",
                ),
              ),
            },
            model: model.value,
            contextTokens: stats.value?.contextTokens,
            cacheHit:
              stats.value?.latestAssistantUsage &&
              cacheHitRate(stats.value.latestAssistantUsage),
          };
        }
      }
      if (authorized()) return boundedSnapshot(snapshot, brandingNow());
    }, ctx);
  } catch {
    // For denied, timed-out or incompatible upstreams, render the public shell and let the browser connect.
  } finally {
    signal.removeEventListener("abort", terminate);
    terminate();
    try {
      await host.close(BACKGROUND_CONTEXT);
    } finally {
      pending--;
    }
  }
}
