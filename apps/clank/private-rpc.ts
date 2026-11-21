import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
export function listenRpc(
  port: number,
  token: string,
  connected: (peer: WebSocket) => void,
) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error("Invalid bridge credential");
  const expected = Buffer.from(`clank.${token}`);
  const ws = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  });
  const http = createServer(
    { headersTimeout: 3000, requestTimeout: 5000 },
    (_, response) => response.writeHead(404).end(),
  );
  http.on("upgrade", (req, socket, head) => {
    const protocol = Buffer.from(req.headers["sec-websocket-protocol"] ?? "");
    if (
      req.url !== "/rpc" ||
      req.headers.origin !== undefined ||
      protocol.length !== expected.length ||
      !timingSafeEqual(protocol, expected) ||
      ws.clients.size >= 8
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    ws.handleUpgrade(req, socket, head, (peer) => ws.emit("connection", peer));
  });
  ws.on("connection", connected);
  http.listen(port, "127.0.0.1");
  return () => {
    for (const socket of ws.clients) socket.terminate();
    ws.close();
    http.close();
  };
}
