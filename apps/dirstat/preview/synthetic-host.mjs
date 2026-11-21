import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, open, rename, rm, statfs } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { once } from "node:events";

const [port, origin, celldPort] = process.argv.slice(2);
if (
  !origin ||
  new URL(origin).protocol !== "https:" ||
  new URL(origin).origin !== origin ||
  ![port, celldPort].every((value) => /^\d{4,5}$/.test(value))
)
  throw new Error("Invalid preview configuration");
const launcher = new URL("./metadata-launcher.py", import.meta.url).pathname;
const store = process.env.HARRHY_DIRSTAT_STORE;
if (!store || !isAbsolute(store))
  throw new Error("An absolute private inventory directory is required");
const database = `${store}/pending.sqlite`;
const saved = `${store}/latest.sqlite`;
const floor = 512n * 1024n * 1024n;
const pageQuery =
  "SELECT id,name,kind,bytes FROM entry WHERE parent=? AND id>? ORDER BY id LIMIT 41";
let inventory;
let latest;
function openSaved() {
  let db;
  try {
    db = new DatabaseSync(saved, { readOnly: true });
  } catch (error) {
    if (error.errcode === 14) return;
    throw error;
  }
  const { id, receipt } = db.prepare("SELECT id,receipt FROM snapshot").get();
  return {
    id,
    db,
    receipt: JSON.parse(receipt),
    page: db.prepare(pageQuery),
    children: db.prepare(
      "SELECT id,name,kind,bytes FROM entry WHERE parent=? ORDER BY bytes DESC,id LIMIT 64",
    ),
  };
}
async function discard() {
  if (inventory) inventory.db.close();
  inventory = undefined;
  await rm(database, { force: true });
}
async function sync(path) {
  const file = await open(path, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}
await discard();
latest = openSaved();
process.once("SIGTERM", () => {
  void discard().finally(() => process.exit(0));
});
let busy = false;
let nextStart = 0;
const server = createServer(
  { requestTimeout: 5000, headersTimeout: 4000 },
  async (request, response) => {
    const send = (status) =>
      response.writeHead(status, { "Cache-Control": "no-store" }).end();
    const { method, url, headers } = request;
    if (headers.host !== new URL(origin).host) return send(403);
    if (method === "GET" && (url === "/" || url === "/viewer.js")) {
      try {
        const asset = await fetch(`http://127.0.0.1:${celldPort}${url}`, {
          signal: AbortSignal.timeout(4000),
        });
        response.writeHead(asset.status, {
          "Content-Type": asset.headers.get("content-type"),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        });
        response.end(Buffer.from(await asset.arrayBuffer()));
      } catch {
        if (!response.headersSent) send(503);
        else response.destroy();
      }
      return;
    }
    function json(data) {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify(data));
    }
    if (method === "GET" && url === "/snapshot")
      return latest ? json({ id: latest.id, ...latest.receipt }) : send(404);
    const current = headers["x-dirstat-scan"];
    const children = /^[/]snapshot[?]parent=(\d{1,8})$/.exec(url);
    if (method === "GET" && children) {
      if (!latest || current !== latest.id) return send(404);
      return json(latest.children.all(Number(children[1])));
    }
    const page = /^\/inventory\?parent=(\d{1,8})&after=(\d{1,8})$/.exec(url);
    if (method === "GET" && page) {
      const source =
        current === inventory?.id
          ? inventory
          : current === latest?.id
            ? latest
            : null;
      if (!source) return send(404);
      const rows = source.page.all(Number(page[1]), Number(page[2]));
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      return response.end(
        JSON.stringify({ rows: rows.slice(0, 40), more: rows.length > 40 }),
      );
    }
    if (method !== "POST" || url !== "/start") return send(404);
    if (
      headers.origin !== origin ||
      headers["x-dirstat-action"] !== "home-scan"
    )
      return send(403);
    if (
      headers["transfer-encoding"] ||
      (headers["content-length"] && headers["content-length"] !== "0")
    )
      return send(400);
    if (busy) {
      response.setHeader("Retry-After", "2");
      return send(409);
    }
    if (Date.now() < nextStart) {
      response.setHeader(
        "Retry-After",
        Math.ceil((nextStart - Date.now()) / 1000),
      );
      return send(429);
    }
    busy = true;
    nextStart = Date.now() + 15000;
    const id = randomUUID();
    const abort = new AbortController();
    response.once("close", () => abort.abort());
    let child;
    try {
      const disk = await statfs(store, { bigint: true });
      if (disk.bavail * disk.bsize < floor + 512n * 1024n * 1024n)
        return send(503);
      await discard();
      const db = new DatabaseSync(database);
      inventory = { id, db };
      await chmod(database, 0o600);
      db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA cache_size=-8192; PRAGMA max_page_count=131072;
        CREATE TABLE entry(id INTEGER PRIMARY KEY,parent INTEGER,name TEXT,kind TEXT,bytes INTEGER);
        CREATE INDEX child ON entry(parent,id); BEGIN`);
      const insert = db.prepare("INSERT INTO entry VALUES(?,?,?,?,?)");
      const update = db.prepare("UPDATE entry SET bytes=? WHERE id=?");
      inventory.page = db.prepare(
        "SELECT id,name,kind,bytes FROM entry WHERE parent=? AND id>? ORDER BY id LIMIT 41",
      );
      if (abort.signal.aborted) return;
      child = spawn("/usr/bin/python3", ["-I", "-B", launcher, "--sanitized"], {
        stdio: ["ignore", "pipe", "ignore"],
        env: {},
        signal: abort.signal,
      });
      const exited = new Promise((resolve) => {
        child.once("error", () => resolve(false));
        child.once("close", (code) => resolve(code === 0));
      });
      response.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store, no-transform",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
      });
      response.write(JSON.stringify({ id, start: true }) + "\n");
      let diskStats;
      let bytes = 0;
      let complete;
      let checked = 0;
      let failure = "Scan interrupted";
      for await (const line of createInterface({ input: child.stdout })) {
        bytes += Buffer.byteLength(line) + 1;
        if (line.length > 512 * 1024 || bytes > 2 * 1024 ** 3)
          throw new Error("Output resource ceiling");
        if (bytes - checked > 1024 * 1024) {
          checked = bytes;
          const free = await statfs(store, { bigint: true });
          if (free.bavail * free.bsize < floor)
            throw new Error("Inventory disk free-space floor");
        }
        const frame = JSON.parse(line);
        if (frame.disk) diskStats = frame.disk;
        if (frame.abortReason) failure = frame.abortReason;
        else if (frame.done) complete = frame;
        else {
          for (const [entry, parent, name, kind, size] of frame.events ?? [])
            insert.run(entry, parent, name, kind, size);
          for (const [entry, size] of frame.sizes ?? [])
            update.run(size, entry);
          if (frame.events)
            frame.events = frame.events
              .filter((event) => event[5])
              .map((event) => event.slice(0, 4));
          delete frame.sizes;
          if (!response.write(JSON.stringify({ id, ...frame }) + "\n"))
            await once(response, "drain", { signal: abort.signal });
        }
      }
      if (!(await exited) || !complete) throw new Error(failure);
      if (
        db
          .prepare(
            "SELECT coalesce(sum(bytes),0) AS bytes FROM entry WHERE parent=0",
          )
          .get().bytes !== complete.fileBytes
      )
        throw new Error("Inventory did not reconcile");
      db.exec(
        "CREATE INDEX allocation ON entry(parent,bytes DESC,id); CREATE TABLE snapshot(id TEXT, receipt TEXT)",
      );
      const { page_count } = db.prepare("PRAGMA page_count").get();
      const { page_size } = db.prepare("PRAGMA page_size").get();
      complete.inventoryBytes = page_count * page_size;
      complete.savedAt = new Date().toISOString();
      complete.disk = diskStats;
      db.prepare("INSERT INTO snapshot VALUES(?,?)").run(
        id,
        JSON.stringify(complete),
      );
      db.exec("COMMIT");
      db.close();
      inventory = undefined;
      await sync(database);
      await rename(database, saved);
      await sync(store);
      latest?.db.close();
      latest = openSaved();
      console.info(
        JSON.stringify({
          event: "scan_finished",
          visited: complete.visited,
          elapsedMs: complete.elapsedMs,
        }),
      );
      response.end(JSON.stringify({ id, ...complete }) + "\n");
    } catch (error) {
      child?.kill();
      await discard();
      if (abort.signal.aborted) nextStart = 0;
      else if (!response.headersSent) send(503);
      else
        response.end(
          JSON.stringify({
            id,
            failed:
              error.errcode === 13
                ? "Inventory quota reached"
                : /ceiling|floor/.test(error.message)
                  ? error.message
                  : "Scan interrupted",
          }) + "\n",
        );
    } finally {
      busy = false;
    }
  },
);
server.listen(Number(port), "127.0.0.1");
