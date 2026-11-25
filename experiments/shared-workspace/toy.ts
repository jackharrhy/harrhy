import { createServer, type Server } from "node:http";
import { newWebSocketRpcSession } from "capnweb";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import { check, fixture, hosts, type Host, type Principal } from "./access.ts";
import { rooms, type PushHooks, type ToyRpc } from "./room.ts";
import { openStore } from "./storage.ts";
export type { Host, Principal } from "./access.ts";
export type { PushSink, PushChunk, RoomRef, ToyRpc } from "./room.ts";
// ws supplies the methods Cap’n Web uses, but its types differ from DOM WebSocket.
export function socketSession(ws: WsSocket, localMain?: ToyRpc) {
  return newWebSocketRpcSession<ToyRpc>(ws as unknown as WebSocket, localMain);
}

export async function boot(dbPath: string, push: PushHooks = {}) {
  const store = openStore(dbPath);
  const { Main, stop } = rooms(store, push);
  const servers: { http: Server; wss: WebSocketServer }[] = [];
  async function close() {
    stop();
    await Promise.all(
      servers.map(async ({ http, wss }) => {
        for (const ws of wss.clients) ws.terminate();
        await Promise.all([
          new Promise<void>((resolve) => http.close(() => resolve())),
          new Promise<void>((resolve) => wss.close(() => resolve())),
        ]);
      }),
    );
    store.close();
  }
  try {
    const urls: Record<Host, string> = { home: "", away: "" };
    for (const host of hosts) {
      const http = createServer((_req, res) => {
        res.writeHead(404);
        res.end();
      });
      const wss = new WebSocketServer({
        noServer: true,
        maxPayload: 16 * 1024,
        perMessageDeflate: false,
      });
      servers.push({ http, wss });
      http.on("upgrade", (req, socket, head) => {
        const authorization = req.headers.authorization;
        const principal =
          authorization === undefined ? undefined : fixture.get(authorization);
        if (
          principal?.host !== host ||
          req.url !== "/rpc" ||
          req.headers.origin !== undefined
        ) {
          socket.end(
            "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
          );
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) =>
          socketSession(ws, new Main(host, principal.principal)),
        );
      });
      await new Promise<void>((resolve, reject) => {
        http.once("error", reject);
        http.listen(0, "127.0.0.1", resolve);
      });
      const address = http.address();
      check(address && typeof address !== "string", "MISSING_ADDRESS");
      urls[host] = `ws://127.0.0.1:${address.port}/rpc`;
    }
    return {
      urls,
      close,
      local: (host: Host, principal: Principal): ToyRpc =>
        new Main(host, principal),
    };
  } catch (err) {
    await close();
    throw err;
  }
}
