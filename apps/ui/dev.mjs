import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { Readable } from "node:stream";
import { readdir, readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { resolve } from "node:path";
import { createRequestListener } from "remix/node-fetch-server";
import { defaultHosts } from "./app/hosts.ts";

// A stable loopback listener keeps the leased route alive while fresh Node
// processes compile both server modules and the browser graph before handoff.
const root = import.meta.dirname;
const allowedHosts =
  process.env.UI_HOSTS?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean) ?? defaultHosts;

// Node fetch rewrites Host to its URL authority; use HTTP directly so probes
// and forwarding preserve the app's exact hostname boundary on loopback.
function fetchLocal(url, { method = "GET", headers, body, signal } = {}) {
  return new Promise((accept, reject) => {
    const outgoing = httpRequest(
      url,
      { method, headers: Object.fromEntries(new Headers(headers)), signal },
      (incoming) => {
        const responseHeaders = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2)
          responseHeaders.append(
            incoming.rawHeaders[index],
            incoming.rawHeaders[index + 1],
          );
        const empty =
          method === "HEAD" || [204, 304].includes(incoming.statusCode);
        if (empty) incoming.resume();
        accept(
          new Response(empty ? null : Readable.toWeb(incoming), {
            status: incoming.statusCode,
            headers: responseHeaders,
          }),
        );
      },
    );
    outgoing.on("error", reject);
    if (body)
      Readable.fromWeb(body)
        .on("error", (error) => outgoing.destroy(error))
        .pipe(outgoing);
    else outgoing.end();
  });
}
const sourceDirs = [resolve(root, "app"), resolve(root, "../../packages/ui")];
const sourceFiles = [resolve(root, "server.ts"), resolve(root, "package.json")];
let active;
let rebuilding = false;
let requested = false;
let failed = false;
let stopping = false;
const children = new Set();

async function revision() {
  const files = [...sourceFiles];
  async function collect(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (!path.endsWith(".md")) files.push(path);
    }
  }
  for (const dir of sourceDirs) await collect(dir);
  const hash = createHash("sha256");
  for (const file of files.toSorted())
    hash.update(file).update(await readFile(file));
  return hash.digest("hex").slice(0, 12);
}

async function candidate(id) {
  const child = fork(resolve(root, "server.ts"), [], {
    cwd: root,
    execArgv: ["--import", "remix/node-tsx"],
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", UI_DEV_CHILD: "1" },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  try {
    const port = await new Promise((accept, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Preview startup timed out")),
        20_000,
      );
      child.once("message", (message) => {
        clearTimeout(timer);
        if (message?.port) accept(message.port);
        else reject(new Error("Invalid preview startup message"));
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Preview candidate exited"));
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const url = `http://127.0.0.1:${port}`;
    for (const path of ["/explorer", "/scenes/radio"]) {
      const response = await fetchLocal(url + path, {
        headers: { Host: allowedHosts[0] ?? "127.0.0.1" },
        signal: AbortSignal.timeout(20_000),
      });
      const html = await response.text();
      if (!response.ok || !html.includes("@harrhy/ui workbench"))
        throw new Error("Preview compilation failed");
    }
    return { child, url, id };
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}

async function rebuild() {
  requested = true;
  if (rebuilding || stopping) return;
  rebuilding = true;
  while (requested) {
    if (stopping) break;
    requested = false;
    try {
      const id = await revision();
      if (active?.id === id) {
        failed = false;
        continue;
      }
      const next = await candidate(id);
      if (stopping || id !== (await revision())) {
        next.child.kill("SIGTERM");
        requested = !stopping;
        continue;
      }
      const previous = active;
      active = next;
      failed = false;
      console.log(`UI preview ready: ${id}`);
      // Allow in-flight asset/document requests to finish against the old process.
      if (previous)
        setTimeout(() => previous.child.kill("SIGTERM"), 2_000).unref();
    } catch (error) {
      failed = true;
      console.error(
        "UI preview rebuild failed; retaining last working revision",
        error,
      );
    }
  }
  rebuilding = false;
}

const server = createServer(
  createRequestListener(async (request) => {
    if (!allowedHosts.includes(new URL(request.url).hostname.toLowerCase()))
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    const current = active;
    const headers = new Headers({
      "Cache-Control": "no-store",
      "X-UI-Preview-State": failed
        ? "rebuild-failed"
        : rebuilding
          ? "rebuilding"
          : "ready",
    });
    if (!current)
      return new Response("Preview is compiling. Reload shortly.", {
        status: 503,
        headers,
      });
    headers.set("X-UI-Preview-Revision", current.id);
    const incoming = new Headers(request.headers);
    incoming.delete("if-none-match");
    incoming.delete("if-modified-since");
    incoming.set("accept-encoding", "identity");
    const target = new URL(
      new URL(request.url).pathname + new URL(request.url).search,
      current.url,
    );
    const response = await fetchLocal(target, {
      method: request.method,
      headers: incoming,
      body: request.body,
      signal: request.signal,
    });
    for (const [key, value] of response.headers)
      if (
        !["cache-control", "etag", "last-modified", "content-length"].includes(
          key,
        )
      )
        headers.set(key, value);
    if (response.headers.get("content-type")?.includes("text/html")) {
      let html = await response.text();
      html = html.replace(
        "</head>",
        `<meta name="ui-preview-revision" content="${current.id}"></head>`,
      );
      if (failed)
        html = html.replace(
          /<body[^>]*>/,
          '$&<aside role="alert">Preview rebuild failed; showing the last working revision. See the preview service log.</aside>',
        );
      return new Response(html, { status: response.status, headers });
    }
    return new Response(response.body, { status: response.status, headers });
  }),
);
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.listen(
  Number(process.env.PORT ?? 18943),
  process.env.HOST ?? "127.0.0.1",
);
let timer;
// Watch directories, not file inodes: editors commonly save via atomic rename.
const watchers = [root, sourceDirs[1]].map((path) =>
  watch(path, { recursive: true }, (_event, name) => {
    if (name?.includes("__tests__") || name?.endsWith(".md")) return;
    if (
      path === root &&
      name &&
      !name.startsWith("app/") &&
      !["server.ts", "package.json"].includes(name)
    )
      return;
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 150);
  }),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    for (const child of children) child.kill("SIGTERM");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
await rebuild();
