import { randomUUID } from "node:crypto";
import { listenRpc } from "./private-rpc.ts";
import { newWebSocketRpcSession, RpcTarget } from "capnweb";
import { BACKGROUND_CONTEXT, withAbortSignal } from "../pi/src/api/v1/index.ts";
import type { Host } from "../pi/src/runtime/chord.ts";
import { Sessions } from "../pi/plugins/sessions/contract.ts";
import {
  diff,
  MAX_ROWS,
  parseCommand,
  project,
  type Commands,
  type Frame,
  type Sink,
} from "./app/session-state.ts";

/** Install only alongside the fake Pi host with its own data directory. */
export function startFixtureBridge(host: Host, cwd: string, token: string) {
  return listenRpc(18149, token, (socket) => {
    const lifetime = new AbortController();
    const close = () => {
      lifetime.abort();
      socket.close(4001, "Fixture connection ended");
    };
    socket.on("error", close);
    socket.once("close", () => lifetime.abort());
    const bindDeadline = setTimeout(() => socket.terminate(), 8000);
    let execute: Commands["execute"] | undefined;
    let writing = false;
    class Fixture extends RpcTarget {
      async execute(input: unknown) {
        if (!execute || writing || lifetime.signal.aborted)
          throw Error("Command unavailable");
        writing = true;
        const deadline = setTimeout(() => socket.terminate(), 8000);
        try {
          await execute(parseCommand(input));
        } finally {
          clearTimeout(deadline);
          writing = false;
        }
      }
    }
    const sink = newWebSocketRpcSession<Sink>(
      socket as unknown as WebSocket,
      new Fixture(),
      {
        limits: { maxMessageSize: 4096 },
        onSendError: () => Error("Fixture command refused"),
      },
    );
    async function deliver(frame: Frame) {
      const timer = setTimeout(() => socket.terminate(), 8000);
      try {
        await sink.deliver(frame);
      } finally {
        clearTimeout(timer);
      }
    }
    // The authenticated service, not the browser, selects this fixed principal and contract.
    void host
      .root(
        async (ctx) => {
          const sessions = await ctx.get(Sessions, {});
          if (sessions.variant !== "owner")
            throw Error("Expected fixture owner");
          const bound = await sessions.state.watch(ctx);
          const watch = await sessions.sessions.watch(ctx);
          try {
            if (bound.value.kind !== "live") throw Error("Sessions not live");
            bound.start(async (call) => {
              if (call.kind !== "value" || call.value.kind !== "live") close();
            });
            const epoch = randomUUID();
            let seq = 0;
            let previous = project(watch.value);
            execute = async (command) => {
              if (sessions.state.value.kind !== "live")
                throw Error("Not bound");
              if (command.kind === "create") {
                if (sessions.sessions.value.length >= MAX_ROWS)
                  throw Error("Fixture full");
                await sessions.create(
                  {
                    title: command.title,
                    cwd,
                    model: { provider: "faux", modelId: "faux-1" },
                    thinkingLevel: "off",
                  },
                  ctx,
                );
              } else {
                const row = sessions.sessions.value.find(
                  (candidate) => candidate.id === command.id,
                );
                if (!row || row.archivedAt !== null)
                  throw Error("Unknown active session");
                if (command.kind === "rename")
                  await sessions.rename(
                    { id: row.id, title: command.title },
                    ctx,
                  );
                else await sessions.archive({ id: row.id }, ctx);
              }
            };
            clearTimeout(bindDeadline);
            await deliver({ kind: "snapshot", epoch, seq, rows: previous });
            watch.start(async (call) => {
              if (call.kind !== "value" || call.retired) return close();
              const next = project(call.value);
              const delta = diff(previous, next);
              if (delta.put.length || delta.remove.length)
                await deliver({ kind: "change", epoch, seq: ++seq, ...delta });
              previous = next;
            });
            await Promise.race([watch.closed, bound.closed]);
          } finally {
            execute = undefined;
            await Promise.all([bound.stop(), watch.stop()]);
          }
        },
        withAbortSignal(lifetime.signal, BACKGROUND_CONTEXT),
        { principal: { kind: "owner", access: "local" } },
      )
      .catch(() => {
        if (!lifetime.signal.aborted)
          console.warn("Clank fixture subscription ended before completion");
      })
      .finally(() => {
        clearTimeout(bindDeadline);
        close();
        sink[Symbol.dispose]();
      });
  });
}
