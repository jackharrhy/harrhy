import { createServer } from "node:http";
import { once } from "node:events";
import { hrtime } from "node:process";
import { DatabaseSync } from "node:sqlite";
import {
  newWebSocketRpcSession,
  RpcStub,
  RpcTarget,
  type RpcCompatible,
} from "capnweb";
import WS, { WebSocketServer } from "ws";

export const leaseMs = 750;
export const now = () => Number(hrtime.bigint()) / 1e6;
type Worker = "a" | "b";
type Reader = "owner" | "marty";
type Acl = { epoch: number; read: boolean };
type Chunk = { seq: number; text: string };
type Mark = { reader: Reader; at: number };
interface Notice extends RpcTarget {
  apply(epoch: number): void;
}
export interface Sink extends RpcTarget {
  chunk(chunk: Chunk): void;
}
interface Room extends RpcTarget {
  watch(sink: Sink): void;
}
export interface OwnerAcl extends RpcTarget {
  change(read: boolean, drop?: Worker): { epoch: number; committedAt: number };
  status(epoch: number): "pending" | "enforced" | "superseded";
}
interface AuthorityLink extends RpcTarget {
  attach(notice: Notice): Acl;
  lease(): Acl;
}
export interface Stream extends RpcTarget {
  open(): Room;
  emit(): Promise<Mark[]>;
  reconnect(): Promise<void>;
  leaseStatus(): "leased" | "closed";
}

function requireFixture(value: unknown, message = "DENIED"): asserts value {
  if (!value) throw new Error(message);
}

function rpc<T extends RpcCompatible<T>>(ws: WS, local?: RpcTarget) {
  // ws provides the browser-compatible methods used by Cap’n Web.
  return newWebSocketRpcSession<T>(ws as unknown as WebSocket, local);
}

export async function dial<T extends RpcCompatible<T>>(
  url: string,
  fixture: string,
  local?: RpcTarget,
) {
  requireFixture(/^ws:\/\/127\.0\.0\.1:\d+\/rpc$/.test(url));
  const ws = new WS(url, {
    headers: { authorization: `Bearer fixture-${fixture}` },
    handshakeTimeout: 1000,
  });
  await once(ws, "open");
  return { ws, api: rpc<T>(ws, local) };
}

async function serve(roots: Map<string, RpcTarget>) {
  const http = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16_384 });
  http.on("upgrade", (req, socket, head) => {
    const root = roots.get(req.headers.authorization ?? "");
    if (!root || req.url !== "/rpc" || req.headers.origin !== undefined) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      rpc(ws, root);
    });
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  requireFixture(address && typeof address !== "string");
  return `ws://127.0.0.1:${address.port}/rpc`;
}

async function authority(path: string) {
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA synchronous=FULL; CREATE TABLE acl (epoch INTEGER, read INTEGER); INSERT INTO acl VALUES (0, 1)",
  );
  let acl: Acl = { epoch: 0, read: true };
  const links = new Map<Worker, RpcStub<Notice>>();
  const confirmed = new Set<Worker>();

  class Owner extends RpcTarget implements OwnerAcl {
    change(read: unknown, drop?: unknown) {
      requireFixture(
        typeof read === "boolean" &&
          (drop === undefined || drop === "a" || drop === "b"),
        "BAD_INPUT",
      );
      const epoch = acl.epoch + 1;
      db.prepare("UPDATE acl SET epoch=?, read=?").run(epoch, Number(read));
      const committedAt = now();
      acl = { epoch, read };
      confirmed.clear();
      for (const [worker, notice] of links) {
        if (worker === drop) continue; // Deterministic simulated notification loss.
        void notice.apply(epoch).then(
          () => {
            if (acl.epoch === epoch && links.get(worker) === notice)
              confirmed.add(worker);
          },
          () => {
            /* No confirmation on a broken link. */
          },
        );
      }
      return { epoch, committedAt };
    }
    status(epoch: number) {
      if (epoch !== acl.epoch) return "superseded";
      return confirmed.size === 2 ? "enforced" : "pending";
    }
  }

  class Link extends RpcTarget implements AuthorityLink {
    #worker: Worker;
    constructor(worker: Worker) {
      super();
      this.#worker = worker;
    }
    attach(notice: unknown) {
      requireFixture(notice instanceof RpcStub, "BAD_INPUT");
      const worker = this.#worker;
      const callback = (notice as RpcStub<Notice>).dup();
      links.get(worker)?.[Symbol.dispose]();
      links.set(worker, callback);
      callback.onRpcBroken(() => {
        if (links.get(worker) === callback) {
          links.delete(worker);
          callback[Symbol.dispose]();
        }
      });
      // Explicit application round trip, not an inference from lease age.
      const epoch = acl.epoch;
      void callback.apply(epoch).then(
        () => {
          if (acl.epoch === epoch && links.get(worker) === callback)
            confirmed.add(worker);
        },
        () => {},
      );
      return acl;
    }
    lease() {
      return acl;
    }
  }
  return serve(
    new Map<string, RpcTarget>([
      ["Bearer fixture-authority-owner", new Owner()],
      ["Bearer fixture-link-a", new Link("a")],
      ["Bearer fixture-link-b", new Link("b")],
    ]),
  );
}

async function server(worker: Worker, authorityUrl: string) {
  type Access =
    | { kind: "closed"; epoch: number }
    | { kind: "leased"; epoch: number; until: number };
  let access: Access = { kind: "closed", epoch: -1 };
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let link: Awaited<ReturnType<typeof dial<AuthorityLink>>> | undefined;
  let connection = 0;
  let seq = 0;
  const observers = new Set<{
    reader: Reader;
    epoch: number;
    sink: RpcStub<Sink>;
    busy: boolean;
  }>();

  function remove(observer: typeof observers extends Set<infer T> ? T : never) {
    if (observers.delete(observer)) observer.sink[Symbol.dispose]();
  }

  function closeAccess(epoch: number) {
    clearTimeout(expiry);
    access = { kind: "closed", epoch };
    for (const observer of observers)
      if (observer.reader === "marty") remove(observer);
  }

  function allowed(epoch: number) {
    return (
      access.kind === "leased" && access.epoch === epoch && now() < access.until
    );
  }

  async function reconnect() {
    const attempt = ++connection;
    closeAccess(access.epoch);
    link?.ws.terminate();
    class Receiver extends RpcTarget implements Notice {
      apply(epoch: number) {
        if (attempt !== connection) throw new Error("STALE_LINK");
        if (epoch > access.epoch) closeAccess(epoch);
      }
    }
    const next = await dial<AuthorityLink>(authorityUrl, `link-${worker}`);
    if (attempt !== connection) {
      next.ws.terminate();
      return;
    }
    link = next;
    await next.api.attach(new Receiver());
    // Count the entire network round trip against the local monotonic lease.
    const until = now() + leaseMs;
    const grant = await next.api.lease();
    if (attempt !== connection || grant.epoch < access.epoch) return;
    closeAccess(grant.epoch);
    if (!grant.read || now() >= until) return;
    access = { kind: "leased", epoch: grant.epoch, until };
    expiry = setTimeout(
      () => closeAccess(grant.epoch),
      Math.ceil(until - now()),
    );
  }

  class LiveRoom extends RpcTarget implements Room {
    #reader: Reader;
    #epoch: number;
    #connection = connection;
    constructor(reader: Reader, epoch: number) {
      super();
      this.#reader = reader;
      this.#epoch = epoch;
    }
    watch(sink: unknown) {
      requireFixture(
        this.#reader === "owner" ||
          (this.#connection === connection && allowed(this.#epoch)),
      );
      requireFixture(
        sink instanceof RpcStub && observers.size < 16,
        "BAD_INPUT",
      );
      const retained = (sink as RpcStub<Sink>).dup();
      const observer = {
        reader: this.#reader,
        epoch: this.#epoch,
        sink: retained,
        busy: false,
      };
      observers.add(observer);
      retained.onRpcBroken(() => remove(observer));
    }
  }
  class Main extends RpcTarget implements Stream {
    #reader: Reader;
    constructor(reader: Reader) {
      super();
      this.#reader = reader;
    }
    open() {
      requireFixture(this.#reader === "owner" || allowed(access.epoch));
      return new LiveRoom(this.#reader, access.epoch);
    }
    leaseStatus() {
      requireFixture(this.#reader === "owner");
      return allowed(access.epoch) ? "leased" : "closed";
    }
    reconnect() {
      requireFixture(this.#reader === "owner");
      return reconnect();
    }
    async emit() {
      requireFixture(this.#reader === "owner");
      const chunk = { seq: ++seq, text: "[synthetic agent chunk; no tools]" };
      const marks: Mark[] = [];
      const completions: Promise<unknown>[] = [];
      for (const observer of observers) {
        if (observer.busy) continue; // At most one in flight, no unsent queue.
        if (observer.reader === "marty" && !allowed(observer.epoch)) {
          remove(observer);
          continue;
        }
        const at = now();
        // Fence and enqueue are in the same JS turn, with no intervening await.
        observer.busy = true;
        completions.push(
          observer.sink.chunk(chunk).then(
            () => {
              observer.busy = false;
            },
            () => remove(observer),
          ),
        );
        marks.push({ reader: observer.reader, at });
      }
      await Promise.all(completions);
      return marks;
    }
  }
  return serve(
    new Map<string, RpcTarget>([
      ["Bearer fixture-stream-owner", new Main("owner")],
      ["Bearer fixture-stream-marty", new Main("marty")],
    ]),
  );
}

if (process.send) {
  const [, , role, argument] = process.argv;
  requireFixture(argument !== undefined, "MISSING_ARGUMENT");
  requireFixture(
    role === "authority" || role === "a" || role === "b",
    "BAD_ROLE",
  );
  const url = await (role === "authority"
    ? authority(argument)
    : server(role, argument));
  process.send(url);
  process.on("disconnect", () => process.exit(0));
}
