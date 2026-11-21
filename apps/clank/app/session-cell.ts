import { newWebSocketRpcSession, RpcTarget } from "capnweb";
import { MAX_BYTES, parseCommand, type Commands, type Frame } from "./session-state.ts";

/** Standard (non-hibernating) sockets: one browser and one private RPC peer per binding. */
export class SessionCell {
  #count = 0;
  #token: string;
  constructor(_state: unknown, env: { HARRHY_CLANK_BRIDGE_TOKEN: string }) {
    this.#token = env.HARRHY_CLANK_BRIDGE_TOKEN;
  }
  fetch() {
    if (this.#count >= 8) return new Response("Fixture full", { status: 503 });
    const pair = new WebSocketPair();
    const client = pair[1];
    client.accept();
    const upstream = new WebSocket("ws://127.0.0.1:18149/rpc", `clank.${this.#token}`);
    this.#count++;
    let closed = false,
      writing = false;
    let ack:
      | { epoch: string; seq: number; resolve(): void; reject(error: Error): void }
      | undefined;
    let epoch: string | undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      this.#count--;
      ack?.reject(Error("Disconnected"));
      ack = undefined;
      clearTimeout(expiry);
      client.close(4001, "Fixture disconnected");
      upstream.close(4001, "Fixture disconnected");
      pi[Symbol.dispose]();
    };
    const expiry = setTimeout(close, 30 * 60_000);
    class BrowserSink extends RpcTarget {
      async deliver(frame: Frame) {
        if (closed || ack) throw Error("Subscription ended");
        epoch = frame.epoch;
        const done = Promise.withResolvers<void>();
        ack = { epoch, seq: frame.seq, resolve: done.resolve, reject: done.reject };
        client.send(JSON.stringify(frame));
        await done.promise;
      }
    }
    const pi = newWebSocketRpcSession<Commands>(upstream, new BrowserSink(), {
      limits: { maxMessageSize: MAX_BYTES * 2, maxDepth: 32 },
    });
    for (const socket of [client, upstream]) {
      socket.addEventListener("close", close);
      socket.addEventListener("error", close);
    }
    client.addEventListener("message", async ({ data }) => {
      if (closed) return;
      try {
        if (typeof data !== "string" || data.length > 1024) return close();
        const input = JSON.parse(data);
        if (!epoch || input.epoch !== epoch) return close();
        if (input.kind === "ack") {
          if (!ack || input.seq !== ack.seq) return close();
          ack.resolve();
          ack = undefined;
          return;
        }
        if (writing) return close();
        const command = parseCommand(input);
        writing = true;
        try {
          await pi.execute(command);
          if (!closed) client.send('{"kind":"result","ok":true}');
        } catch {
          if (!closed) client.send('{"kind":"result","ok":false}');
        } finally {
          writing = false;
        }
      } catch {
        close();
      }
    });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
}
