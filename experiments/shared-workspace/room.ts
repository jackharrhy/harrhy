import { randomUUID } from "node:crypto";
import { RpcStub, RpcTarget } from "capnweb";
import {
  check,
  isRoute,
  isTarget,
  roomAccess,
  routes,
  type Host,
  type Principal,
  type Route,
  type Target,
  type Identity,
} from "./access.ts";
import type { Store, TranscriptEvent, Receipt } from "./storage.ts";
interface SubscriptionRpc extends RpcTarget {
  next(): TranscriptEvent[];
}
export type PushChunk = { seq: number; speaker: "agent"; text: string };
export interface PushSink extends RpcTarget {
  chunk(value: PushChunk): void;
}
interface PushWatch extends RpcTarget {
  cancel(): void;
}
export type PushHooks = {
  schedule?: (flush: () => void) => void;
  enqueued?: (route: Route, principal: Principal, chunk: PushChunk) => void;
};
const mockReply = "[mock agent: input recorded; no tools]";

interface RoomRpc extends RpcTarget {
  read(): TranscriptEvent[];
  subscribe(): SubscriptionRpc;
  observe(sink: PushSink): PushWatch;
  send(id: string, body: string, citationId?: string | null): Receipt;
  chooseCitation(
    index: number,
    start: number,
    end: number,
    destination: Route,
  ): string;
}
declare const roomRefBrand: unique symbol;
// A locator, not a bearer capability. Only the authority can resolve it.
export type RoomRef = string & { readonly [roomRefBrand]: true };

export interface ToyRpc extends RpcTarget {
  whoami(): Identity;
  open(target?: Target): RoomRpc;
  reference(target?: Target): RoomRef;
  resolve(ref: RoomRef): RoomRpc;
  setMarty(target: Target, read: boolean, send: boolean): void;
}

const text = (s: unknown, max: number): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= max;
const isIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

export function rooms(store: Store, push: PushHooks) {
  const { acl, allow, canRead } = roomAccess(store);
  const { update } = store;
  const observers = new Set<{
    route: Route;
    principal: Principal;
    epoch: number;
    offer(chunk: PushChunk): void;
    cancel(): void;
  }>();
  const schedule =
    push.schedule ??
    ((flush: () => void) => {
      setImmediate(flush);
    });

  class Watch extends RpcTarget implements PushWatch {
    #stop: () => void;
    constructor(stop: () => void) {
      super();
      this.#stop = stop;
    }
    cancel() {
      this.#stop();
    }
    [Symbol.dispose]() {
      this.cancel();
    }
  }

  function observe(
    route: Route,
    principal: Principal,
    epoch: number,
    sink: RpcStub<PushSink>,
  ) {
    // The incoming stub belongs to the RPC call. Retain a private reference
    // for the lifetime of the observer and release it on every cancel path.
    const callback = sink.dup();
    const pending: PushChunk[] = [];
    const observer = { route, principal, epoch, offer, cancel };
    observers.add(observer);
    callback.onRpcBroken(cancel);
    return new Watch(cancel);

    function cancel() {
      if (!observers.delete(observer)) return;
      pending.length = 0;
      callback[Symbol.dispose]();
    }
    function offer(chunk: PushChunk) {
      if (pending.length >= 32) {
        cancel();
        return;
      }
      pending.push(chunk);
      if (pending.length === 1) schedule(flush);
    }
    function flush() {
      for (const chunk of pending.splice(0)) {
        // No await between the current ACL/epoch check and the outbound RPC.
        if (!observers.has(observer) || !canRead(route, principal, epoch)) {
          cancel();
          return;
        }
        void callback.chunk(chunk).catch(cancel);
        push.enqueued?.(route, principal, chunk);
      }
    }
  }

  class Subscription extends RpcTarget implements SubscriptionRpc {
    #next: () => TranscriptEvent[];
    constructor(next: () => TranscriptEvent[]) {
      super();
      this.#next = next;
    }
    next() {
      return this.#next();
    }
  }
  class Room extends RpcTarget implements RoomRpc {
    #route: Route;
    #principal: Principal;
    #epoch: number;
    constructor(route: Route, p: Principal, epoch: number) {
      super();
      this.#route = route;
      this.#principal = p;
      this.#epoch = epoch;
    }
    read() {
      allow(this.#route, this.#principal, "read", this.#epoch);
      return store.state.rooms[this.#route].events;
    }
    subscribe() {
      allow(this.#route, this.#principal, "read", this.#epoch);
      let cursor = store.state.rooms[this.#route].events.length;
      return new Subscription(() => {
        allow(this.#route, this.#principal, "read", this.#epoch);
        const events = store.state.rooms[this.#route].events;
        const batch = events.slice(cursor);
        cursor = events.length;
        return batch;
      });
    }
    observe(sink: unknown) {
      allow(this.#route, this.#principal, "read", this.#epoch);
      check(sink instanceof RpcStub, "BAD_INPUT");
      return observe(
        this.#route,
        this.#principal,
        this.#epoch,
        sink as RpcStub<PushSink>,
      );
    }
    send(id: unknown, body: unknown, citationId: unknown = null) {
      const route = this.#route,
        p = this.#principal;
      allow(route, p, "send", this.#epoch);
      check(
        text(id, 80) &&
          text(body, 1024) &&
          (citationId === null || text(citationId, 80)),
        "BAD_INPUT",
      );
      // Authorize before looking up receipts: an old request ID is not a grant.
      const prior = store.state.rooms[route].receipts.find(
        (r) => r.p === p && r.id === id,
      );
      if (prior) {
        check(
          prior.body === body && prior.citationId === citationId,
          "CONFLICT",
        );
        return prior.receipt;
      }
      const cite =
        citationId === null
          ? null
          : store.state.citations.find((c) => c.id === citationId);
      check(
        citationId === null || (cite?.destination === route && p === "owner"),
        "INVALID_CITATION",
      );
      const committedReceipt = update((next) => {
        const room = next.rooms[route];
        const receipt = { id, route, seq: room.events.length };
        room.events.push(
          {
            speaker: p,
            text: body,
            citation: cite
              ? { source: cite.source, excerpt: cite.excerpt }
              : null,
          },
          { speaker: "agent", text: mockReply },
        );
        room.receipts.push({ p, id, body, citationId, receipt });
        return receipt;
      });
      for (const observer of observers) {
        if (observer.route === route)
          observer.offer({
            seq: committedReceipt.seq + 1,
            speaker: "agent",
            text: mockReply,
          });
      }
      return committedReceipt;
    }
    chooseCitation(
      index: unknown,
      start: unknown,
      end: unknown,
      destination: unknown,
    ) {
      check(this.#principal === "owner");
      check(
        isRoute(destination) &&
          destination !== this.#route &&
          isIndex(index) &&
          isIndex(start) &&
          isIndex(end),
        "BAD_INPUT",
      );
      const value = store.state.rooms[this.#route].events[index]?.text;
      check(
        typeof value === "string" &&
          start >= 0 &&
          end > start &&
          end <= value.length,
        "BAD_INPUT",
      );
      return update((next) => {
        const id = randomUUID();
        next.citations.push({
          id,
          source: this.#route,
          excerpt: value.slice(start, end),
          destination,
        });
        return id;
      });
    }
  }
  // Process-local locator registry: reconnect preserves refs; restart does not.
  const references = new Map<Route, RoomRef>(
    routes.map((route) => [route, randomUUID() as RoomRef]),
  );
  class Main extends RpcTarget implements ToyRpc {
    #host: Host;
    #principal: Principal;
    constructor(h: Host, p: Principal) {
      super();
      this.#host = h;
      this.#principal = p;
    }
    whoami() {
      return { host: this.#host, principal: this.#principal };
    }
    reference(target: unknown = "familiar") {
      check(isTarget(target), "BAD_TARGET");
      return references.get(`${this.#host}/${target}`)!;
    }
    resolve(ref: unknown) {
      const target = (["familiar", "scoped"] as const).find(
        (candidate) => references.get(`${this.#host}/${candidate}`) === ref,
      );
      check(target, "BAD_REF");
      return this.open(target);
    }
    open(target: unknown = "familiar") {
      check(isTarget(target), "BAD_TARGET");
      const route: Route = `${this.#host}/${target}`;
      const rule = acl(route, this.#principal);
      check(rule.read || rule.send);
      return new Room(route, this.#principal, rule.epoch);
    }
    setMarty(target: unknown, read: unknown, send: unknown) {
      check(this.#principal === "owner");
      check(
        isTarget(target) &&
          typeof read === "boolean" &&
          typeof send === "boolean",
        "BAD_INPUT",
      );
      const route: Route = `${this.#host}/${target}`;
      update((next) => {
        const rule = next.rooms[route].marty;
        // Losing either right invalidates the whole handle, even after regrant.
        if ((rule.read && !read) || (rule.send && !send)) rule.epoch++;

        Object.assign(rule, { read, send });
      });
      // Commit first, then discard unsent work before acknowledging the ACL change.
      for (const observer of observers) {
        if (
          observer.route === route &&
          !canRead(route, observer.principal, observer.epoch)
        )
          observer.cancel();
      }
    }
  }

  return {
    Main,
    stop() {
      for (const observer of observers) observer.cancel();
    },
  };
}
