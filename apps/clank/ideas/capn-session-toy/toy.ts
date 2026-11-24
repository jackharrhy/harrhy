import {createServer, type Server} from "node:http";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {newWebSocketRpcSession, RpcTarget} from "capnweb";
import {WebSocketServer, type WebSocket as WsSocket} from "ws";

const hosts = ["home", "away"] as const;
const people = ["owner", "marty", "outsider"] as const;
export type Host = (typeof hosts)[number];
export type Principal = (typeof people)[number];
type Target = "familiar" | "scoped";
type Route = `${Host}/${Target}`;
type Access = {read: boolean; send: boolean; epoch: number};
type Identity = {host: Host; principal: Principal};
type Excerpt = {source: Route; excerpt: string};
type Citation = Excerpt & {id: string; destination: Route};
type Event = {speaker: "agent" | "terminal"; text: string}
  | {speaker: Principal; text: string; citation: Excerpt | null};
type Receipt = {id: string; route: Route; seq: number};
type RoomState = {
  marty: Access;
  events: Event[];
  receipts: {p: Principal; id: string; body: string; citationId: string | null; receipt: Receipt}[];
};
type State = {citations: Citation[]; rooms: Record<Route, RoomState>};

interface SubscriptionRpc extends RpcTarget {
  next(): Event[];
}
interface RoomRpc extends RpcTarget {
  read(): Event[];
  subscribe(): SubscriptionRpc;
  send(id: string, body: string, citationId?: string | null): Receipt;
  chooseCitation(index: number, start: number, end: number, destination: Route): string;
}
export interface ToyRpc extends RpcTarget {
  whoami(): Identity;
  open(target?: Target): RoomRpc;
  setMarty(target: Target, read: boolean, send: boolean): void;
}

// ws supplies the methods Cap’n Web uses, but its types differ from DOM WebSocket.
export function socketSession(ws: WsSocket, localMain?: ToyRpc) {
  return newWebSocketRpcSession<ToyRpc>(ws as unknown as WebSocket, localMain);
}

const fixture = new Map<string, Identity>(hosts.flatMap(host => people.map(principal =>
  [`Bearer fixture-${host}-${principal}`, {host, principal}] as const)));
function check(ok: unknown, code = "DENIED"): asserts ok {
  if (!ok) throw new Error(code);
}
const text = (s: unknown, max: number): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= max;
const isTarget = (value: unknown): value is Target => value === "familiar" || value === "scoped";
const isIndex = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const routes = ["home/familiar", "home/scoped", "away/familiar", "away/scoped"] as const satisfies readonly Route[];
const isRoute = (value: unknown): value is Route => routes.some(route => route === value);
function initialRoom(route: Route): RoomState {
  return {
    marty: {read: route === "home/familiar", send: false, epoch: 0},
    events: [{speaker:"agent", text:`Mock notes for ${route}. Selected sample. Private remainder.`},
      {speaker:"terminal", text:"[mock terminal: idle; no execution]"}],
    receipts: [],
  };
}
const initial = (): State => ({citations: [], rooms: {
  "home/familiar": initialRoom("home/familiar"),
  "home/scoped": initialRoom("home/scoped"),
  "away/familiar": initialRoom("away/familiar"),
  "away/scoped": initialRoom("away/scoped"),
}});

export async function boot(dbPath: string) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
  db.prepare("INSERT OR IGNORE INTO state VALUES (1, ?)").run(JSON.stringify(initial()));
  const stored = db.prepare("SELECT body FROM state WHERE id=1").get()?.body;
  check(typeof stored === "string", "MISSING_STATE");
  // The private fixture database is only written by this module.
  let state = JSON.parse(stored) as State;
  const update = <T>(edit: (next: State) => T): T => {
    const next = structuredClone(state);
    const result = edit(next);
    db.prepare("UPDATE state SET body=? WHERE id=1").run(JSON.stringify(next));
    state = next;
    return result;
  };
  const acl = (route: Route, p: Principal): Access => p === "owner" ? {read:true,send:true,epoch:0}
    : p === "marty" ? state.rooms[route].marty : {read:false,send:false,epoch:0};
  const allow = (route: Route, p: Principal, action: "read" | "send", epoch: number) => {
    const rule = acl(route,p);
    check(rule.epoch === epoch && rule[action]);
  };

  class Subscription extends RpcTarget implements SubscriptionRpc {
    #next: () => Event[];
    constructor(next: () => Event[]) { super(); this.#next = next; }
    next() { return this.#next(); }
  }
  class Room extends RpcTarget implements RoomRpc {
    #route: Route; #p: Principal; #epoch: number;
    constructor(route: Route, p: Principal, epoch: number) { super(); this.#route=route; this.#p=p; this.#epoch=epoch; }
    read() {
      allow(this.#route,this.#p,"read",this.#epoch);
      return state.rooms[this.#route].events;
    }
    subscribe() {
      const {events} = state.rooms[this.#route];
      allow(this.#route,this.#p,"read",this.#epoch);
      let cursor = events.length;
      return new Subscription(() => {
        allow(this.#route,this.#p,"read",this.#epoch);
        const events = state.rooms[this.#route].events;
        const batch = events.slice(cursor);
        cursor = events.length;
        return batch;
      });
    }
    send(id: unknown, body: unknown, citationId: unknown = null) {
      const route=this.#route, p=this.#p;
      allow(route,p,"send",this.#epoch);
      check(text(id,80) && text(body,1024) && (citationId === null || text(citationId,80)),"BAD_INPUT");
      const prior = state.rooms[route].receipts.find(r => r.p === p && r.id === id);
      if (prior) {
        check(prior.body === body && prior.citationId === citationId,"CONFLICT");
        return prior.receipt;
      }
      const cite = citationId === null ? null : state.citations.find(c => c.id === citationId);
      check(citationId === null || (cite?.destination === route && p === "owner"),"INVALID_CITATION");
      return update(next => {
        const room = next.rooms[route];
        const receipt = {id, route, seq:room.events.length};
        room.events.push({speaker:p,text:body,citation:cite ? {source:cite.source,excerpt:cite.excerpt} : null},
          {speaker:"agent",text:"[mock agent: input recorded; no tools]"});
        room.receipts.push({p,id,body,citationId,receipt});
        return receipt;
      });
    }
    chooseCitation(index: unknown, start: unknown, end: unknown, destination: unknown) {
      check(this.#p === "owner");
      check(isRoute(destination) && destination !== this.#route &&
        isIndex(index) && isIndex(start) && isIndex(end),"BAD_INPUT");
      const value = state.rooms[this.#route].events[index]?.text;
      check(typeof value === "string" && start >= 0 && end > start && end <= value.length,"BAD_INPUT");
      return update(next => {
        const id = randomUUID();
        next.citations.push({id, source:this.#route, excerpt:value.slice(start,end),destination});
        return id;
      });
    }
  }
  class Main extends RpcTarget implements ToyRpc {
    #host: Host; #p: Principal;
    constructor(h: Host, p: Principal) { super(); this.#host=h; this.#p=p; }
    whoami() { return {host:this.#host,principal:this.#p}; }
    open(target: unknown = "familiar") {
      check(isTarget(target),"BAD_TARGET");
      const route: Route = `${this.#host}/${target}`;
      const rule = acl(route,this.#p);
      check(rule.read || rule.send);
      return new Room(route,this.#p,rule.epoch);
    }
    setMarty(target: unknown, read: unknown, send: unknown) {
      check(this.#p === "owner");
      check(isTarget(target) && typeof read === "boolean" && typeof send === "boolean","BAD_INPUT");
      update(next => {
        const rule = next.rooms[`${this.#host}/${target}`].marty;
        if ((rule.read && !read) || (rule.send && !send)) rule.epoch++;
        Object.assign(rule,{read,send});
      });
    }
  }

  const servers: {http: Server; wss: WebSocketServer}[] = [];
  async function close() {
    await Promise.all(servers.map(async ({http,wss}) => {
      for (const ws of wss.clients) ws.terminate();
      await Promise.all([new Promise<void>(resolve => http.close(() => resolve())),
        new Promise<void>(resolve => wss.close(() => resolve()))]);
    }));
    db.close();
  }
  try {
    const urls: Record<Host, string> = {home: "", away: ""};
    for (const host of hosts) {
      const http = createServer((_req,res) => { res.writeHead(404); res.end(); });
      const wss = new WebSocketServer({noServer:true,maxPayload:16*1024,perMessageDeflate:false});
      servers.push({http,wss});
      http.on("upgrade", (req,socket,head) => {
        const authorization = req.headers.authorization;
        const principal = authorization === undefined ? undefined : fixture.get(authorization);
        if (principal?.host !== host || req.url !== "/rpc" || req.headers.origin !== undefined) {
          socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
          return;
        }
        wss.handleUpgrade(req,socket,head,ws => socketSession(ws,new Main(host,principal.principal)));
      });
      await new Promise<void>((resolve,reject) => {
        http.once("error",reject);
        http.listen(0,"127.0.0.1",resolve);
      });
      const address = http.address();
      check(address && typeof address !== "string", "MISSING_ADDRESS");
      urls[host] = `ws://127.0.0.1:${address.port}/rpc`;
    }
    return {urls,close};
  } catch (err) { await close(); throw err; }
}
