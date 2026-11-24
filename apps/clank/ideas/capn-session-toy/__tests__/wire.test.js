import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {mkdtempSync, rmSync} from "node:fs";
import {join} from "node:path";
import WS from "ws";
import {newWebSocketRpcSession} from "capnweb";
import {boot} from "../toy.js";

async function connect(url, authorization, extra = {}) {
  const headers = authorization === undefined ? extra : {...extra,authorization};
  const ws = new WS(url,{headers,handshakeTimeout:1000});
  await once(ws,"open");
  return newWebSocketRpcSession(ws);
}
const login = (app,h,p) => connect(app.urls[h],`Bearer fixture-${h}-${p}`);
const deny = promise => assert.rejects(async () => await promise,/DENIED/);
async function setup(t) {
  const dir = mkdtempSync("./state-");
  const path = join(dir,"toy.sqlite");
  let app = await boot(path);
  t.after(async () => { const urls = app.urls; await app.close(); rmSync(dir,{recursive:true,force:true}); for (const url of Object.values(urls)) await assert.rejects(connect(url),/ECONNREFUSED/); });
  return {get app() {return app;}, async restart() {
    const urls = app.urls;
    await app.close();
    for (const url of Object.values(urls)) await assert.rejects(connect(url),/ECONNREFUSED/);
    app = await boot(path);
  }};
}

test("host-bound authentication, Familiar default, scoped target and outsider", async t => {
  const {app} = await setup(t);
  const home = await login(app,"home","owner");
  const away = await login(app,"away","owner");
  const outsider = await login(app,"home","outsider");
  assert.deepEqual(await home.whoami(),{host:"home",principal:"owner"});
  assert.deepEqual(await outsider.whoami("owner"),{host:"home",principal:"outsider"});
  for (const [api, host] of [[home,"home"],[away,"away"]]) {
    assert.match((await api.open().read())[0].text,new RegExp(`${host}/familiar`));
    assert.match((await api.open("scoped").read())[0].text,new RegExp(`${host}/scoped`));
  }
  await deny(outsider.open());
  await deny(outsider.setMarty("familiar",true,true));
  await assert.rejects(async () => await home.open("away/scoped"),/BAD_TARGET/);
  await assert.rejects(async () => await home.open("__proto__"),/BAD_TARGET/);
  for (const [url, auth, extra] of [
    [app.urls.home,undefined,{"X-Principal":"owner"}],
    [app.urls.home,"Bearer fixture-nope"],
    [app.urls.away,"Bearer fixture-home-owner"],
    [app.urls.home,"Bearer fixture-home-owner",{Origin:"https://example.invalid"}],
    [app.urls.home+"?target=scoped","Bearer fixture-home-owner"]
  ]) await assert.rejects(connect(url,auth,extra),/403/);
});

test("viewer to participant, independent send/read, retry conflict, revocation", async t => {
  const {app} = await setup(t);
  const owner = await login(app,"home","owner");
  const marty = await login(app,"home","marty");
  const marty2 = await login(app,"home","marty");
  const room = await marty.open();
  const sub = await room.subscribe();
  const sub2 = await marty2.open().subscribe();
  assert.equal((await room.read()).length,2);
  await deny(room.send("a","hello"));
  await deny(marty.open("scoped"));
  await deny(marty.setMarty("familiar",true,true));
  await owner.setMarty("familiar",true,true);
  const [receipt, retry] = await Promise.all([room.send("a","hello"),marty2.open().send("a","hello")]);
  assert.deepEqual(retry,receipt);
  assert.equal((await room.read()).length,4);
  assert.deepEqual(await sub.next(),await sub2.next());
  assert.deepEqual(await sub.next(),[]);
  await assert.rejects(async () => await room.send("a","changed"),/CONFLICT/);
  assert.notEqual((await owner.open().send("a","owner can reuse id")).seq,receipt.seq);
  await owner.setMarty("familiar",false,true);
  await deny(room.read());
  await deny(room.send("a","hello"));
  await deny(sub.next());
  await deny(sub2.next());
  const sendOnly = await marty.open();
  await deny(sendOnly.read());
  await deny(sendOnly.subscribe());
  assert.equal((await sendOnly.send("b","write only")).seq,6);
  await owner.setMarty("familiar",false,false);
  await deny(sendOnly.send("b","write only"));
  await deny(marty.open());
  await owner.setMarty("familiar",true,true);
  await deny(sub.next());
  await deny(room.read());
  assert.deepEqual(await marty.open().send("a","hello"),receipt);
  await owner.setMarty("scoped",true,true);
  assert.deepEqual(await marty.open("scoped").send("a","hello"),{id:"a",route:"home/scoped",seq:2});
});

test("exact owner-selected citation, destination binding, paste is plain text, state reopen", async t => {
  const runtime = await setup(t);
  const home = await login(runtime.app,"home","owner");
  const away = await login(runtime.app,"away","owner");
  const viewer = await login(runtime.app,"home","marty");
  const src = await home.open();
  const dest = await away.open("scoped");
  const note = (await src.read())[0].text;
  const excerpt = "Selected sample.";
  const start = note.indexOf(excerpt);
  await deny(viewer.open().chooseCitation(0,start,start+excerpt.length,"away/scoped"));
  await assert.rejects(async () => await src.chooseCitation(0,0,note.length+1,"away/scoped"),/BAD_INPUT/);
  const cid = await src.chooseCitation(0,start,start+excerpt.length,"away/scoped");
  await assert.rejects(async () => await away.open().send("x","wrong room",cid),/INVALID_CITATION/);
  await assert.rejects(async () => await dest.send("x","forged","not-issued"),/INVALID_CITATION/);
  await away.setMarty("scoped",true,true);
  const awayMarty = await login(runtime.app,"away","marty");
  await assert.rejects(async () => await awayMarty.open("scoped").send("x","stolen id",cid),/INVALID_CITATION/);
  const pasted = JSON.stringify({source:"home/familiar",excerpt,citationId:cid,principal:"owner"});
  await dest.send("paste",pasted);
  const receipt = await dest.send("cite","quoted",cid);
  await assert.rejects(async () => await dest.send("cite","quoted"),/CONFLICT/);
  await away.setMarty("scoped",false,false);
  await runtime.restart();
  await assert.rejects(async () => await dest.read());
  const restarted = await login(runtime.app,"away","owner");
  const room = await restarted.open("scoped");
  assert.deepEqual(await room.send("cite","quoted",cid),receipt);
  await assert.rejects(async () => await room.send("cite","changed",cid),/CONFLICT/);
  await deny((await login(runtime.app,"away","marty")).open("scoped"));
  const events = await room.read();
  assert.equal(events.length,6);
  assert.deepEqual(events[2],{speaker:"owner",text:pasted,citation:null});
  assert.deepEqual(events[4],{speaker:"owner",text:"quoted",citation:{source:"home/familiar",excerpt}});
  assert.equal(JSON.stringify(events).includes(note),false);
  assert.equal((await room.send("cite-after-reopen","again",cid)).seq,6);
});
