import { deployment, type DeploymentBindings } from "./deployment.ts";
import { newWebSocketRpcSession, RpcTarget, type RpcStub } from "capnweb";
import type { ReceiveFrame, SessionApi } from "./session-api.ts";
import {
  MAX_BYTES,
  parseCommand,
  type Command,
  type Commands,
  type Frame,
} from "./session-state.ts";

/** A browser watch owns its callback and a separate, private upstream session. */
export class SessionCell {
  #count = 0;
  #token: string;
  #config: ReturnType<typeof deployment>;
  constructor(
    _state: unknown,
    env: DeploymentBindings & { HARRHY_CLANK_BRIDGE_TOKEN: string },
  ) {
    this.#config = deployment(env);
    this.#token = env.HARRHY_CLANK_BRIDGE_TOKEN;
  }
  fetch() {
    if (!this.#config) return new Response(null, { status: 503 });
    const { readOnly } = this.#config;
    if (this.#count >= 8) return new Response("Fixture full", { status: 503 });
    const pair = new WebSocketPair();
    const client = pair[1];
    client.accept();
    this.#count++;
    // Dial from the admitted upgrade event; do not depend on an RPC callback's event context.
    const upstream = new WebSocket(
      `ws://127.0.0.1:${this.#config.sourcePort}/rpc`,
      `clank.${this.#token}`,
    );
    const watching = Promise.withResolvers<void>();
    let receive: RpcStub<ReceiveFrame> | undefined;
    let boundEpoch: string | undefined;
    let closed = false,
      writing = false;
    const close = () => {
      if (closed) return;
      closed = true;
      this.#count--;
      clearTimeout(bindDeadline);
      clearTimeout(expiry);
      client.close(4001, "Fixture disconnected");
      watching.resolve();
      upstream.close(4001, "Fixture disconnected");
      receive?.[Symbol.dispose]();
      pi[Symbol.dispose]();
      browser[Symbol.dispose]();
    };
    const bindDeadline = setTimeout(close, 8000);
    const expiry = setTimeout(close, 30 * 60_000);
    async function write(expected: string, command: Command) {
      if (readOnly) throw Error("Read-only catalog");
      if (closed || !boundEpoch || boundEpoch !== expected) {
        close();
        throw Error("Binding ended");
      }
      if (writing) throw Error("Command in progress");
      writing = true;
      try {
        await pi.execute(parseCommand(command));
      } finally {
        writing = false;
      }
    }
    class Catalog extends RpcTarget implements SessionApi {
      async watch(callback: RpcStub<ReceiveFrame>) {
        if (closed || receive || typeof callback !== "function")
          throw Error("Invalid watch");
        receive = callback.dup(); // The argument itself is borrowed until watch returns.
        watching.resolve();
      }
      create(epoch: string, title: string) {
        return write(epoch, { kind: "create", title });
      }
      rename(epoch: string, id: string, title: string) {
        return write(epoch, { kind: "rename", id, title });
      }
      archive(epoch: string, id: string) {
        return write(epoch, { kind: "archive", id });
      }
    }
    class StateSink extends RpcTarget {
      async deliver(frame: Frame) {
        await watching.promise;
        if (closed || !receive) throw Error("Binding ended");
        boundEpoch = frame.epoch;
        clearTimeout(bindDeadline);
        await receive(frame); // RPC completion, including the browser render, is the acknowledgement.
      }
    }
    const pi = newWebSocketRpcSession<Commands>(upstream, new StateSink(), {
      limits: { maxMessageSize: MAX_BYTES * 2, maxDepth: 32 },
    });
    upstream.addEventListener("error", close);
    upstream.addEventListener("close", close);
    const browser = newWebSocketRpcSession(client, new Catalog(), {
      limits: { maxMessageSize: 4096, maxDepth: 16 },
      onSendError: () => Error("Fixture request refused"),
    });
    browser.onRpcBroken(close);
    client.addEventListener("close", close);
    client.addEventListener("error", close);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
}
