import { createServer, type ServerResponse } from "node:http";
import { open, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
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
    listen = port(downstream),
    host = `127.0.0.1:${listen}`;
  if (!directory || pi === listen)
    throw Error("Expected PI_PORT VIEW_PORT PRIVATE_DIR");
  const password = await secret(join(directory, "view-password"));
  if (!/^[a-f0-9]{64}$/.test(password))
    throw Error("Expected a fresh 32-byte hex viewer password");
  const authorization = Buffer.from(
    `Basic ${Buffer.from(`clank:${password}`).toString("base64")}`,
  );
  const cookie = await secret(join(directory, "pi-cookie"));
  const match =
    /^p2_owner_(\d+)=(?:local\.)?[0-9a-f]{32}\.(\d+)\.[0-9a-f]{64}$/.exec(
      cookie,
    );
  if (!match || match[1] !== String(pi) || Number(match[2]) <= Date.now())
    throw Error("Expected current cookie for this Pi port");
  const js = await readFile(
    new URL("../.celld/read-only/client.js", import.meta.url),
  );
  const readers = new Set<ServerResponse>();
  let latest = "";
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    if (
      req.headers.host !== host ||
      req.headers["sec-fetch-site"] === "cross-site" ||
      (req.headers.origin !== undefined &&
        req.headers.origin !== `http://${host}`)
    ) {
      res.writeHead(403).end();
      return;
    }
    const supplied = Buffer.from(req.headers.authorization ?? "");
    if (
      supplied.length !== authorization.length ||
      !timingSafeEqual(supplied, authorization)
    ) {
      res
        .writeHead(401, { "WWW-Authenticate": 'Basic realm="Clank read-only"' })
        .end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" }).end();
      return;
    }
    if (req.url === "/") {
      res
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(
          '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clank · Overview</title><main id="overview"></main><script type="module" src="/client.js"></script></html>',
        );
      return;
    }
    if (req.url === "/client.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" }).end(js);
      return;
    }
    if (req.url !== "/catalog") {
      res.writeHead(404).end();
      return;
    }
    if (!latest || readers.size >= 8) {
      res.writeHead(503).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    readers.add(res);
    res.on("close", () => readers.delete(res));
    res.write(latest);
  });
  server.on("upgrade", (_req, socket) =>
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"),
  );
  server.on("error", () => end("Cannot open read-only listener"));
  const deadline = setTimeout(() => end("Pi did not bind"), 8000);
  setTimeout(
    () => end("Read-only lease ended"),
    Math.min(3600000, Number(match[2]) - Date.now()),
  );
  await followCatalog(
    pi,
    cookie,
    (json) => {
      const frame = `data: ${json}\n\n`;
      if (latest === frame) return;
      if (!latest) {
        clearTimeout(deadline);
        server.listen(listen, "127.0.0.1", () =>
          console.log("Read-only Overview ready on " + host),
        );
      }
      latest = frame;
      for (const res of readers) {
        if (res.writableNeedDrain) res.destroy();
        else res.write(frame);
      }
    },
    () => {
      latest = "";
      server.close();
      for (const res of readers) res.destroy();
    },
  );
}
function end(reason: string): never {
  console.error(reason);
  process.exit(1);
}
void run().then(
  () => end("Pi binding ended"),
  () => end("Read-only connector refused configuration or Pi binding"),
);
