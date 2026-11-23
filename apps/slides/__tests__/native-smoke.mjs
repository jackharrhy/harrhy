// Runs only in a fresh project with a synthetic HTTPS origin and owner session.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { parse } from "jsonc-parser";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { verifyCelldBinary } from "../../../scripts/celld-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const binary = process.env.CELLD_BIN;
if (!binary?.startsWith("/"))
  throw Error("Set CELLD_BIN to the qualified absolute executable");
await verifyCelldBinary(binary);
const dir = await mkdtemp(join(tmpdir(), "slides-native-test-"));
const probe = createServer().listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const base = "http://127.0.0.1:" + port,
  origin = "https://slides.invalid",
  secret = randomUUID();
const issuer = "https://issuer.invalid",
  name = "__Host-slides_session";
const payload = Buffer.from(
  JSON.stringify({
    subject: "owner",
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  }),
).toString("base64url");
const tag = createHmac("sha256", secret)
  .update(
    JSON.stringify([
      "slides-auth-v1",
      [origin, issuer, "slides", "project", "org"],
      name,
      payload,
    ]),
  )
  .digest("base64url");
const cookie = name + "=" + payload + "." + tag;
let child,
  logs = "";
const read = (path, init) =>
  fetch(base + path, { redirect: "manual", ...init });
const edit = (body, headers = { cookie, origin }) =>
  read("/edit", { method: "POST", headers, body });
const form = (revision, intent, other = {}) =>
  new URLSearchParams({
    revision: String(revision),
    intent,
    id: "image",
    ...other,
  });
async function start() {
  child = spawn(binary, ["dev", ".", "--port", String(port), "--no-watch"], {
    cwd: dir,
    env: {
      HOME: dir,
      PATH: process.env.PATH,
      TMPDIR: dir,
      CELLD_ESBUILD: resolve(root, "node_modules/.bin/esbuild"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (b) => (logs += b));
  child.stderr.on("data", (b) => (logs += b));
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) break;
    if ((await read("/position").catch(() => null))?.ok) return;
    await delay(100);
  }
  throw Error("Fixture did not start: " + logs.slice(-3000));
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const finished = once(child, "exit");
  child.kill("SIGTERM");
  await finished;
}
try {
  // Adapter supplies the HTTPS request URL of a terminating proxy. No real
  // issuer, proxy, browser cookies, .dev.vars or runtime store are consumed.
  await build({
    stdin: {
      contents: `
    import app from "./worker.ts"; export { DeckCell, PresentationCell } from "./worker.ts";
    export default { fetch(r,env) {
      const req = new Request("${origin}"+new URL(r.url).pathname+new URL(r.url).search,r);
      if (req.headers.get("Origin")==="${base}") req.headers.set("Origin","${origin}");
      return app.fetch(req,env);
    }};
  `,
      resolveDir: root,
    },
    outfile: join(dir, "worker.js"),
    bundle: true,
    platform: "neutral",
    format: "esm",
    external: ["node:*", "cloudflare:*"],
    conditions: ["workerd", "worker", "browser"],
    mainFields: ["module", "main"],
    jsx: "automatic",
    jsxImportSource: "remix/component",
  });
  const errors = [];
  const config = parse(
    await readFile(join(root, "wrangler.jsonc"), "utf8"),
    errors,
    { allowTrailingComma: true },
  );
  assert.deepEqual(errors, []);
  config.main = "worker.js";
  config.name = "slides-native-test";
  config.vars = {
    HARRHY_AUTH_ISSUER: issuer,
    HARRHY_AUTH_OWNER_SUBJECT: "owner",
    HARRHY_AUTH_CLIENT_ID: "slides",
    HARRHY_AUTH_PROJECT_ID: "project",
    HARRHY_AUTH_ORGANIZATION_ID: "org",
    HARRHY_SLIDES_SESSION_SECRET: secret,
    HARRHY_SLIDES_PRESENTER_WRITES: "1",
    HARRHY_SLIDES_ORIGIN: origin,
  };
  await writeFile(join(dir, "wrangler.jsonc"), JSON.stringify(config));
  await start();
  assert.equal((await read("/edit")).status, 403);
  assert.equal(
    (
      await edit(form(1, "discard"), {
        cookie,
        origin: "https://wrong.invalid",
      })
    ).status,
    403,
  );
  const editor = await read("/edit?slide=image", { headers: { cookie } });
  assert.match(await editor.text(), /Save slide to draft/);
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKXkAAAAASUVORK5CYII=",
    "base64",
  );
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = "/media/" + hash;
  const upload = new FormData();
  for (const [k, v] of form(1, "save", {
    title: "Synthetic revision",
    body: "A private draft",
    x: "4",
    y: "12",
    width: "80",
  }))
    upload.set(k, v);
  upload.set("media", new Blob([bytes], { type: "image/png" }), "pixel.png");
  upload.set(
    "media",
    new Blob([Uint8Array.of(1, 2, 3)], { type: "image/png" }),
    "invalid.png",
  );
  assert.equal((await edit(upload)).status, 415);
  upload.set("media", new Blob([bytes], { type: "image/png" }), "pixel.png");
  const saved = await edit(upload);
  assert.equal(saved.status, 303, await saved.text());
  assert.equal((await edit(form(1, "publish"))).status, 409);
  assert.equal((await read(path)).status, 404);
  assert.equal((await read("/edit" + path)).status, 403);
  assert.deepEqual(
    Buffer.from(
      await (await read("/edit" + path, { headers: { cookie } })).arrayBuffer(),
    ),
    bytes,
  );
  assert.doesNotMatch(await (await read("/")).text(), /Synthetic revision/);
  await stop();
  await start();
  assert.match(
    await (await read("/edit?slide=image", { headers: { cookie } })).text(),
    /Synthetic revision/,
  );
  const go = (revision, position) =>
    read("/position", {
      method: "POST",
      headers: { origin, cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ revision, position }),
    });
  assert.equal((await go(1, 2)).status, 200);
  assert.equal((await edit(form(2, "up"))).status, 303);
  assert.equal((await edit(form(3, "publish"))).status, 303);
  const synced = await (await read("/position")).json();
  assert.deepEqual(synced, {
    scope: synced.scope,
    cursor: 2,
    position: 1,
    slideId: "image",
    revision: 3,
    alternate: false,
  });
  assert.equal((await go(1, 0)).status, 409);
  await stop();
  await start();
  assert.deepEqual(await (await read("/position")).json(), synced);
  assert.deepEqual(Buffer.from(await (await read(path)).arrayBuffer()), bytes);
  assert.match(await (await read("/")).text(), /Synthetic revision/);
  assert.equal((await edit(form(3, "clear-media"))).status, 303);
  assert.equal((await read(path)).status, 200);
  assert.equal((await edit(form(4, "discard"))).status, 303);
  assert.equal(
    (await read("/edit" + path, { headers: { cookie } })).status,
    200,
  );
  assert.equal((await edit(form(5, "remove"))).status, 303);
  assert.equal((await edit(form(6, "publish"))).status, 303);
  assert.equal((await read(path)).status, 404);
  assert.equal((await (await read("/position")).json()).slideId, "cover");
  if (process.env.CHROME_BIN) {
    const { browserSmoke } = await import("./browser-smoke.mjs");
    await browserSmoke(base, cookie, async () => {
      await stop();
      await start();
    });
  }
  const html = await (await read("/edit", { headers: { cookie } })).text();
  const rev = /Draft (\d+)/.exec(html)?.[1];
  assert.ok(rev);
  const concurrent = await Promise.all(
    [1, 2].map(() => edit(form(rev, "add", { id: "cover", kind: "text" }))),
  );
  assert.deepEqual(
    concurrent.map((r) => r.status).toSorted((a, b) => a - b),
    [303, 409],
  );
  console.log(
    "PASS: native editor, revision conflicts, isolated draft/R2 media, publish, stable playback, discard and process restarts",
  );
} finally {
  await stop();
  await rm(dir, { recursive: true, force: true });
}
