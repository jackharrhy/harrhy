import {createServer} from "node:http";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {newWebSocketRpcSession, RpcTarget} from "capnweb";
import {WebSocketServer} from "ws";

const hosts = ["home", "away"];
const people = ["owner", "marty", "outsider"];
const fixture = new Map(hosts.flatMap(h => people.map(p => [`Bearer fixture-${h}-${p}`, {h,p}])));
const fail = code => { throw new Error(code); };
const check = (ok, code = "DENIED") => { if (!ok) fail(code); };
const text = (s, max) => typeof s === "string" && s.length > 0 && s.length <= max;
const routes = hosts.flatMap(h => [`${h}/familiar`, `${h}/scoped`]);
const initial = () => ({citations: [], rooms: Object.fromEntries(routes.map(route => [route, {
  marty: {read: route === "home/familiar", send: false, epoch: 0},
  events: [{speaker:"agent", text:`Mock notes for ${route}. Selected sample. Private remainder.`},
    {speaker:"terminal", text:"[mock terminal: idle; no execution]"}], receipts: []
}]))});

export async function boot(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
  db.prepare("INSERT OR IGNORE INTO state VALUES (1, ?)").run(JSON.stringify(initial()));
  let state = JSON.parse(db.prepare("SELECT body FROM state WHERE id=1").get().body);
  const update = edit => {
    const next = structuredClone(state);
    const result = edit(next);
    db.prepare("UPDATE state SET body=? WHERE id=1").run(JSON.stringify(next));
    state = next;
    return result;
  };
  const acl = (route, p) => p === "owner" ? {read:true,send:true,epoch:0}
    : p === "marty" ? state.rooms[route].marty : {read:false,send:false,epoch:0};
  const allow = (route,p,action,epoch) => {
    const rule = acl(route,p);
    check(rule.epoch === epoch && rule[action]);
  };

  class Subscription extends RpcTarget {
    #next;
    constructor(next) { super(); this.#next = next; }
    next() { return this.#next(); }
  }
  class Room extends RpcTarget {
    #route; #p; #epoch;
    constructor(route,p,epoch) { super(); this.#route=route; this.#p=p; this.#epoch=epoch; }
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
    send(id,body,citationId = null) {
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
    chooseCitation(index,start,end,destination) {
      check(this.#p === "owner");
      check(routes.includes(destination) && destination !== this.#route &&
        [index,start,end].every(Number.isSafeInteger),"BAD_INPUT");
      const value = state.rooms[this.#route].events[index]?.text;
      check(typeof value === "string" && start >= 0 && end > start && end <= value.length,"BAD_INPUT");
      return update(next => {
        const id = randomUUID();
        next.citations.push({id, source:this.#route, excerpt:value.slice(start,end),destination});
        return id;
      });
    }
  }
  class Main extends RpcTarget {
    #host; #p;
    constructor(h,p) { super(); this.#host=h; this.#p=p; }
    whoami() { return {host:this.#host,principal:this.#p}; }
    open(target = "familiar") {
      check(target === "familiar" || target === "scoped","BAD_TARGET");
      const route = `${this.#host}/${target}`;
      const rule = acl(route,this.#p);
      check(rule.read || rule.send);
      return new Room(route,this.#p,rule.epoch);
    }
    setMarty(target,read,send) {
      check(this.#p === "owner");
      check((target === "familiar" || target === "scoped") && typeof read === "boolean" && typeof send === "boolean","BAD_INPUT");
      update(next => {
        const rule = next.rooms[`${this.#host}/${target}`].marty;
        if ((rule.read && !read) || (rule.send && !send)) rule.epoch++;
        Object.assign(rule,{read,send});
      });
    }
  }

  const servers = [];
  async function close() {
    await Promise.all(servers.map(async ({http,wss}) => {
      for (const ws of wss.clients) ws.terminate();
      await Promise.all([new Promise(resolve => http.close(resolve)), new Promise(resolve => wss.close(resolve))]);
    }));
    db.close();
  }
  try {
    const urls = {};
    for (const host of hosts) {
      const http = createServer((_req,res) => { res.writeHead(404); res.end(); });
      const wss = new WebSocketServer({noServer:true,maxPayload:16*1024,perMessageDeflate:false});
      servers.push({http,wss});
      http.on("upgrade", (req,socket,head) => {
        const principal = fixture.get(req.headers.authorization);
        if (principal?.h !== host || req.url !== "/rpc" || req.headers.origin !== undefined) {
          socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
          return;
        }
        wss.handleUpgrade(req,socket,head,ws => newWebSocketRpcSession(ws,new Main(host,principal.p)));
      });
      await new Promise((resolve,reject) => {
        http.once("error",reject);
        http.listen(0,"127.0.0.1",resolve);
      });
      urls[host] = `ws://127.0.0.1:${http.address().port}/rpc`;
    }
    return {urls,close};
  } catch (err) { await close(); throw err; }
}
