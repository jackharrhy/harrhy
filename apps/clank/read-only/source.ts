import type { WebSocket as NodeSocket } from "ws";
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { newWebSocketRpcSession } from "capnweb";
import { listenRpc } from "../private-rpc.ts";
import {
  diff,
  type OverviewRow,
  type Sink,
  type Frame,
} from "../app/session-state.ts";
import { followCatalog } from "./chord.ts";
function port(arg: string | undefined) {
  const n = Number(arg);
  if (!Number.isInteger(n) || n < 1 || n > 65535)
    throw Error("Expected a port");
  return n;
}
async function secret(path: string) {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > 4096
    )
      throw Error("Invalid credential file");
    return (await file.readFile("utf8")).trim();
  } finally {
    await file.close();
  }
}

async function run() {
  const [upstream, downstream, directory] = process.argv.slice(2);
  const pi = port(upstream),
    listen = port(downstream);
  if (!directory || pi === listen)
    throw Error("Expected PI_PORT SOURCE_PORT PRIVATE_DIR");
  const token = await secret(join(directory, "bridge-token"));
  if (!/^[a-f0-9]{64}$/.test(token) || listen === 18149)
    throw Error("Invalid read-only source configuration");
  const cookie = await secret(join(directory, "pi-cookie"));
  const match =
    /^p2_owner_(\d+)=(?:local\.)?[0-9a-f]{32}\.(\d+)\.[0-9a-f]{64}$/.exec(
      cookie,
    );
  if (!match || match[1] !== String(pi) || Number(match[2]) <= Date.now())
    throw Error("Expected current cookie for this Pi port");
  let latest: OverviewRow[] = [];
  let stop: (() => void) | undefined;
  const readers = new Map<NodeSocket, () => Promise<void>>();
  function connect(socket: NodeSocket) {
    const sink = newWebSocketRpcSession<Sink>(
      socket as unknown as WebSocket,
      undefined,
      { limits: { maxMessageSize: 4096 } },
    );
    const epoch = randomUUID();
    let seq = 0,
      previous: OverviewRow[] | undefined,
      busy = false;
    async function deliver() {
      if (busy) return;
      busy = true;
      try {
        while (readers.has(socket) && previous !== latest) {
          const next = latest;
          let frame: Frame;
          if (!previous) frame = { kind: "snapshot", epoch, seq, rows: next };
          else {
            const delta = diff(previous, next);
            if (!delta.put.length && !delta.remove.length) {
              previous = next;
              continue;
            }
            frame = { kind: "change", epoch, seq: ++seq, ...delta };
          }
          const timeout = setTimeout(() => socket.terminate(), 8000);
          try {
            await sink.deliver(frame);
          } finally {
            clearTimeout(timeout);
          }
          previous = next;
        }
      } catch {
        socket.terminate();
      } finally {
        busy = false;
      }
    }
    readers.set(socket, deliver);
    socket.once("close", () => {
      readers.delete(socket);
      sink[Symbol.dispose]();
    });
    socket.once("error", () => socket.terminate());
    void deliver();
  }
  const bind = setTimeout(() => end("Pi did not bind"), 8000);
  setTimeout(
    () => end("Source lease ended"),
    Math.min(3600000, Number(match[2]) - Date.now()),
  );
  await followCatalog(
    pi,
    cookie,
    (rows) => {
      latest = rows;
      if (!stop) {
        clearTimeout(bind);
        stop = listenRpc(listen, token, connect);
        console.log("Read-only catalog source bound to Pi");
      }
      for (const wake of readers.values()) void wake();
    },
    () => {
      latest = [];
      readers.clear();
      stop?.();
      stop = undefined;
    },
  );
}
function end(reason: string): never {
  console.error(reason);
  process.exit(1);
}
void run().then(
  () => end("Pi binding ended"),
  () => end("Invalid source configuration or Pi binding"),
);
