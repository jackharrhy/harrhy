import { DurableObject } from "cloudflare:workers";
import { newWebSocketRpcSession, RpcTarget, type RpcStub } from "capnweb";
import { channel } from "@harrhy/live-state/channel";
import type { Frame, Sink } from "@harrhy/live-state/watch";
import type { Cursor, Position } from "./api.ts";

// One volatile room for one board canvas. Anonymous IDs identify sockets, not people.
export class CursorRoom extends DurableObject<Env> {
  #canvas = { peers: new Map<string, Position | null>(), revision: 0 };

  async fetch(request: Request) {
    const board = request.headers.get("x-ref-board");
    const hash = request.headers.get("x-ref-session-hash");
    if (
      !board ||
      !hash ||
      request.headers.get("Upgrade")?.toLowerCase() !== "websocket"
    )
      return new Response("Invalid cursor upgrade", { status: 403 });
    const directory = this.env.DIRECTORY.getByName("main");
    const access = () => directory.socketAccess(board, hash);
    const rename = (title: string) =>
      directory.renameForSession(board, title, hash);
    if (!(await access())) return new Response("Forbidden", { status: 403 });
    const room = this.#canvas;
    if (room.peers.size >= 8)
      return new Response("Cursor room full", { status: 503 });

    const id = crypto.randomUUID();
    const pair = new WebSocketPair();
    const ws = pair[1];
    ws.accept(); // Standard socket: callbacks live only for this connection.
    let subscription: ReturnType<typeof channel<Cursor>> | undefined;
    let watchId: string | undefined;
    let lastWrite = -Infinity;
    let writing = false;
    let closed = false;
    room.peers.set(id, null);
    function close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      if (room.peers.get(id)) room.revision++;
      room.peers.delete(id);
      subscription?.stop();
      ws.close(4001, "Cursor session ended");
    }
    async function authorize() {
      if (closed) throw Error("Cursor access ended");
      if (!(await access()) || closed) {
        close();
        throw Error("Cursor access ended");
      }
    }
    function read(after: number | null): { frame: Frame<Cursor> } {
      const at = room.revision;
      if (after !== null && after > at) return { frame: { kind: "reset" } };
      if (after === at) return { frame: { kind: "same", at } };
      const items = Array.from(room.peers).flatMap(([other, p]) =>
        other !== id && p ? [{ id: other, ...p }] : [],
      );
      return { frame: { kind: "snapshot", at, items } };
    }
    let sampled = -1;
    let nextCheck = Date.now() + 2000;
    // Deliver from the reader socket lifetime. Starting asynchronous delivery
    // from a departing writer can strand another socket waiting for its ack.
    const timer = setInterval(() => {
      const now = Date.now();
      if (!subscription) {
        if (now >= nextCheck) close();
        return;
      }
      if (subscription.due && now >= subscription.due) return close();
      if (room.peers.get(id) && now - lastWrite >= 5000) {
        room.peers.set(id, null);
        room.revision++;
      }
      if (sampled !== room.revision || now >= nextCheck) {
        sampled = room.revision;
        nextCheck = now + 2000;
        this.ctx.waitUntil(subscription.wake());
      }
    }, 150);
    let renaming = false;
    class Canvas extends RpcTarget {
      async rename(title: string) {
        if (closed || renaming || typeof title !== "string")
          throw Error("Invalid rename");
        renaming = true;
        try {
          return await rename(title);
        } finally {
          renaming = false;
        }
      }
      start(key: string, after: number | null, sink: RpcStub<Sink<Cursor>>) {
        if (
          closed ||
          watchId ||
          typeof key !== "string" ||
          key.length !== 36 ||
          (after !== null && (!Number.isSafeInteger(after) || after < 0))
        )
          throw Error("Invalid cursor watch");
        watchId = key;
        subscription = channel<Cursor>(
          after,
          sink,
          async (cursor) => {
            await authorize();
            return read(cursor);
          },
          () => {},
          close,
          () => {},
        );
        return subscription.wake();
      }
      stop(key: string) {
        if (key === watchId) close();
      }
      async move(point: Position | null) {
        if (closed || !subscription || writing || Date.now() - lastWrite < 80)
          return;
        if (
          point !== null &&
          (!point ||
            typeof point !== "object" ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            Math.abs(point.x) > 1e6 ||
            Math.abs(point.y) > 1e6)
        )
          throw Error("Invalid position");
        writing = true;
        try {
          await authorize();
          if (closed) return;
          lastWrite = Date.now();
          room.peers.set(
            id,
            point === null ? null : { x: point.x, y: point.y },
          );
          room.revision++;
        } finally {
          writing = false;
        }
      }
    }
    const root = newWebSocketRpcSession(ws, new Canvas(), {
      limits: { maxMessageSize: 4096, maxDepth: 16 },
    });
    ws.addEventListener("close", () => {
      close();
      root[Symbol.dispose]();
    });
    ws.addEventListener("error", close);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
}
