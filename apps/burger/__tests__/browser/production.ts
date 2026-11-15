import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { chromium, type BrowserContext } from "playwright";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const work = mkdtempSync(join(tmpdir(), "tea-burger-browser-"));
const databasePath = join(work, "burger.sqlite");
copyFileSync(join(appRoot, "__tests__/fixtures/burger.sqlite"), databasePath);

const database = new Database(databasePath);
database.run("UPDATE sessions SET expires_at = ?", [Date.now() + 3_600_000]);
const businessTables = [
  "users",
  "tile_catalog",
  "tiles",
  "tile_edits",
  "settings",
  "palettes",
  "zones",
  "zone_cells",
  "zone_members",
] as const;
const businessRows = () =>
  Object.fromEntries(
    businessTables.map((table) => [
      table,
      database.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
const before = businessRows();
let expectedCatalog: unknown = null;
database.close();

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((done) => probe.close(() => done()));
  return port;
}
async function waitFor(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    assert(Date.now() < deadline, `Timed out: ${label}`);
    await Bun.sleep(100);
  }
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn("bun", ["dist/server/server.js"], {
  cwd: appRoot,
  env: {
    ...process.env,
    AUTH_CLIENT_ID: "fixture-public-client",
    AUTH_PROJECT_ID: "fixture-project",
    AUTH_ISSUER: "https://auth.jackharrhy.dev",
    BURGER_URL: origin,
    DB_PATH: databasePath,
    WEB_ROOT: "dist/client",
    NODE_ENV: "production",
    PORT: String(port),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
for (const stream of [server.stdout, server.stderr])
  stream.on("data", (chunk) => {
    serverOutput = (serverOutput + String(chunk)).slice(-4000);
  });

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const contexts: BrowserContext[] = [];
let stopError: Error | undefined;
const mockAuth = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () =>
    new Response("<h1>Mock auth destination</h1>", {
      headers: { "content-type": "text/html" },
    }),
});
try {
  await waitFor(async () => {
    if (server.exitCode !== null)
      throw new Error(`Burger exited: ${serverOutput}`);
    try {
      return (await fetch(origin)).ok;
    } catch {
      return false;
    }
  }, "Burger Remix server");
  const document = await fetch(origin);
  assert.equal(document.status, 200);
  assert.equal(document.headers.get("Cache-Control"), "private, no-store");
  const policy = document.headers.get("Content-Security-Policy") ?? "";
  const nonce = /script-src[^;]*'nonce-([^']+)'/.exec(policy)?.[1];
  assert.ok(nonce);
  assert.match(policy, /connect-src 'self' ws:\/\//);
  const html = await document.text();
  assert.match(html, /Burger · Tea/);
  assert(html.includes(`nonce="${nonce}"`));
  await waitFor(
    async () => (await fetch(`${origin}/assets/game.js`)).ok,
    "Burger static assets",
  );
  for (const path of [
    "/assets/game.js",
    "/assets/burger.css",
    "/assets/atlas.png",
    "/assets/sprites/player.png",
    "/assets/sounds/grilling-meat.mp3",
    "/assets/fonts/ComicSansMS.ttf",
  ]) {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200, path);
    assert((await response.arrayBuffer()).byteLength > 0, path);
  }
  assert.equal((await fetch(`${origin}/auth/me`)).status, 401);

  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const browserErrors: string[] = [];
  const guest = await browser.newContext();
  contexts.push(guest);
  const loginPage = await guest.newPage();
  const authorizationURL = new URL("/authorize", mockAuth.url).href;
  await loginPage.route(`${origin}/auth/login`, (route) =>
    route.fulfill({ status: 302, headers: { location: authorizationURL } }),
  );
  await loginPage.goto(origin);
  await loginPage.waitForFunction(
    () =>
      window.document.getElementById("burger-status")?.textContent ===
      "Sign in to play.",
  );
  const loginRequest = loginPage.waitForRequest(`${origin}/auth/login`);
  await loginPage.getByRole("link", { name: "Sign in to play" }).click();
  const login = await loginRequest;
  assert.equal(login.method(), "GET");
  assert.equal(
    login.isNavigationRequest(),
    true,
    "login is a document request after hydration",
  );
  assert.equal(login.resourceType(), "document");
  await loginPage.waitForURL(authorizationURL);
  await loginPage
    .getByRole("heading", { name: "Mock auth destination" })
    .waitFor();
  await guest.close();

  async function player(sessionId: string) {
    const context = await browser!.newContext();
    contexts.push(context);
    await context.addCookies([
      {
        name: "burger_session",
        value: sessionId,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().startsWith("Failed to load resource:")
      )
        browserErrors.push(message.text());
    });
    const sockets: { url(): string }[] = [];
    page.on("websocket", (socket) => sockets.push(socket));
    await page.goto(origin);
    await page
      .locator("canvas")
      .waitFor({ state: "attached", timeout: 20_000 })
      .catch((error: unknown) => {
        throw new Error(
          `Burger canvas did not mount: ${browserErrors.join(" | ")}`,
          {
            cause: error,
          },
        );
      });
    await page.waitForFunction(
      () =>
        window.context?.me.serverEid != null &&
        window.context?.me.eid != null &&
        window.context?.network.socket?.readyState === WebSocket.OPEN,
    );
    const id = await page.evaluate(() => window.context.me.serverEid!);
    return { context, page, id, sockets };
  }
  const admin = await player("fixture-admin-session");
  const member = await player("fixture-member-session");
  const memberAtlas = await member.context.newPage();
  await memberAtlas.goto(`${origin}/atlas`);
  await memberAtlas
    .getByRole("alert")
    .getByText("An administrator account is required.")
    .waitFor();
  assert.equal(
    await memberAtlas.getByRole("region", { name: "Atlas grid" }).count(),
    0,
  );
  await memberAtlas.close();

  const adminAtlas = await admin.context.newPage();
  await adminAtlas.goto(`${origin}/atlas`);
  await adminAtlas.getByRole("region", { name: "Atlas grid" }).waitFor();
  await adminAtlas.getByRole("button", { name: "wall tile 0, 0" }).click();
  await adminAtlas
    .getByRole("textbox", { name: "Label" })
    .fill("Fixture wall edited");
  await adminAtlas
    .getByRole("button", { name: /Save \(unsaved changes\)/ })
    .click();
  await adminAtlas.getByRole("button", { name: "Save", exact: true }).waitFor();
  const savedCatalog = await adminAtlas.evaluate(async () =>
    (await fetch("/api/catalog")).json(),
  );
  assert.equal(
    savedCatalog.find((entry: { id: number; label: string }) => entry.id === 1)
      ?.label,
    "Fixture wall edited",
  );
  const catalogDb = new Database(databasePath);
  expectedCatalog = catalogDb
    .query("SELECT * FROM tile_catalog ORDER BY rowid")
    .all();
  catalogDb.close();
  await adminAtlas.close();
  await admin.page.getByRole("toolbar", { name: "Burger tools" }).waitFor();
  await admin.page.getByRole("button", { name: "Palette" }).click();
  await admin.page.getByRole("dialog", { name: "Palette" }).waitFor();
  assert(
    (await admin.page
      .locator('[data-burger-window="palette"] button[aria-pressed]')
      .count()) >= 3,
  );
  const paletteWindow = admin.page.locator('[data-burger-window="palette"]');
  const paletteBefore = await paletteWindow.boundingBox();
  assert(paletteBefore);
  await admin.page.mouse.move(paletteBefore.x + 50, paletteBefore.y + 14);
  await admin.page.mouse.down();
  await admin.page.mouse.move(paletteBefore.x + 110, paletteBefore.y + 54);
  await admin.page.mouse.up();
  const paletteMoved = await paletteWindow.boundingBox();
  assert(paletteMoved && paletteMoved.x > paletteBefore.x + 40);
  const grip = paletteWindow.locator("[data-window-resize]");
  const gripBefore = await grip.boundingBox();
  assert(gripBefore);
  await admin.page.mouse.move(gripBefore.x + 8, gripBefore.y + 8);
  await admin.page.mouse.down();
  await admin.page.mouse.move(gripBefore.x + 48, gripBefore.y + 38);
  await admin.page.mouse.up();
  const paletteResized = await paletteWindow.boundingBox();
  assert(paletteResized && paletteResized.width > paletteMoved.width + 20);
  await admin.page.getByRole("button", { name: "Atlas", exact: true }).click();
  await admin.page.getByRole("dialog", { name: "Atlas" }).waitFor();
  await admin.page.getByRole("region", { name: "Atlas grid" }).waitFor();
  assert.equal(await admin.page.getByRole("dialog").count(), 2);
  await admin.page.getByRole("button", { name: "Close Atlas" }).click();
  assert.equal(
    await admin.page.getByRole("dialog", { name: "Atlas" }).count(),
    0,
  );
  await admin.page.getByRole("button", { name: "Zones" }).click();
  await admin.page.getByRole("button", { name: /Fixture Counter/ }).waitFor();
  await admin.page.getByRole("button", { name: /Fixture Counter/ }).click();
  await admin.page.keyboard.press("z");
  assert.equal(
    await admin.page.evaluate(() => window.context.zones.active),
    true,
  );
  await admin.page.getByRole("button", { name: "Bots" }).click();
  await admin.page.getByText("Active bots:").waitFor();
  await admin.page.getByRole("button", { name: "Spawn", exact: true }).click();
  await admin.page.getByRole("button", { name: "Save spawn" }).waitFor();
  await member.page.getByRole("button", { name: "Palette" }).waitFor();
  assert.equal(
    await member.page.getByRole("button", { name: "Zones" }).count(),
    0,
  );
  await member.page.keyboard.press("e");
  assert.equal(
    await member.page.evaluate(() => window.context.editor?.active),
    true,
  );
  await member.page.keyboard.press("e");
  assert.equal(
    await member.page.evaluate(() => window.context.editor?.active),
    false,
  );
  await member.page.waitForFunction(
    (id) => window.context?.network.idMap.has(id),
    admin.id,
  );
  const beforeMove = await member.page.evaluate((id) => {
    const game = window.context;
    return game.world.components.Position.x[game.network.idMap.get(id)!];
  }, admin.id);
  await admin.page.keyboard.down("d");
  await admin.page.waitForTimeout(900);
  await admin.page.keyboard.up("d");
  await member.page.waitForFunction(
    ({ id, x }) => {
      const game = window.context;
      const entity = game?.network.idMap.get(id);
      return (
        entity !== undefined && game.world.components.Position.x[entity] > x + 1
      );
    },
    { id: admin.id, x: beforeMove },
  );

  await admin.page.goto("about:blank");
  await member.page.waitForFunction(
    (id) => !window.context?.network.idMap.has(id),
    admin.id,
  );
  await admin.page.goto(origin);
  await admin.page
    .locator("canvas")
    .waitFor({ state: "attached", timeout: 20_000 });
  await admin.page.waitForFunction(
    () => window.context?.network.socket?.readyState === WebSocket.OPEN,
  );
  assert.equal(await admin.page.locator("canvas").count(), 1);
  assert.equal(
    admin.sockets.filter((socket) => new URL(socket.url()).pathname === "/ws")
      .length,
    2,
  );
  await admin.page.waitForFunction(
    (id) => window.context?.network.idMap.has(id),
    member.id,
  );
  const memberDocument = await member.page.evaluate(
    () => performance.timeOrigin,
  );
  const [logout, logoutResponse] = await Promise.all([
    member.page.waitForRequest(`${origin}/auth/logout`),
    member.page.waitForResponse(`${origin}/auth/logout`),
    member.page.getByRole("button", { name: "Sign out" }).click(),
  ]);
  assert.equal(logout.method(), "POST");
  assert.equal(
    logout.isNavigationRequest(),
    true,
    "logout is a native form submission after hydration",
  );
  assert.equal(logout.resourceType(), "document");
  assert.equal(logout.headers()["origin"], origin);
  assert.match(
    logout.headers()["content-type"] ?? "",
    /application\/x-www-form-urlencoded/,
  );
  assert.equal(logoutResponse.status(), 303);
  assert.equal(logoutResponse.headers()["location"], "/");
  assert.equal(
    await member.page.evaluate(() => typeof window.context),
    "undefined",
    "logout discards authenticated game state",
  );
  assert.notEqual(
    await member.page.evaluate(() => performance.timeOrigin),
    memberDocument,
    "logout replaces the authenticated document",
  );
  await member.page.waitForFunction(
    () =>
      window.document.getElementById("burger-status")?.textContent ===
      "Sign in to play.",
  );
  await member.page.getByRole("link", { name: "Sign in to play" }).waitFor();
  assert.equal(member.page.url(), `${origin}/`);
  assert.equal(await member.page.locator("canvas").count(), 0);
  assert.equal(
    await member.page.getByRole("toolbar", { name: "Burger tools" }).count(),
    0,
  );
  assert.equal(
    (await member.context.request.get(`${origin}/auth/me`)).status(),
    401,
  );
  assert.equal(
    (await member.context.cookies(origin)).some(
      (cookie) => cookie.name === "burger_session",
    ),
    false,
  );
  // Server-side player removal runs from the socket close handler. Observe it
  // before closing this context, rather than relying on browser navigation events.
  await admin.page.waitForFunction(
    (id) => !window.context?.network.idMap.has(id),
    member.id,
  );
  assert.equal(
    member.sockets.filter((socket) => new URL(socket.url()).pathname === "/ws")
      .length,
    1,
  );
  await member.context.close();
  assert.deepEqual(browserErrors, []);
  console.log(
    "Burger browser smoke passed: native auth navigation, Remix/Pixi mount, assets, two sessions, atlas admin edit/member denial, movement, navigation and disconnect.",
  );
} finally {
  await mockAuth.stop(true);
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    const exited = new Promise<void>((done) =>
      server.once("exit", () => done()),
    );
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<void>((_, reject) => {
      timer = setTimeout(() => {
        const phases = serverOutput
          .split("\n")
          .filter((line) => line.includes("Burger shutdown"));
        reject(
          new Error(
            `Burger did not stop within 3 seconds of SIGTERM: ${phases.join(" | ")}`,
          ),
        );
      }, 3000);
    });
    try {
      await Promise.race([exited, timeout]);
      assert.equal(server.exitCode, 0, `Burger shutdown: ${serverOutput}`);
    } catch (error) {
      stopError = error as Error;
      if (server.exitCode === null) {
        server.kill("SIGKILL");
        await exited;
      }
    } finally {
      clearTimeout(timer!);
    }
  }
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  const afterDb = new Database(databasePath);
  assert.deepEqual(
    Object.fromEntries(
      businessTables.map((table) => [
        table,
        afterDb.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ]),
    ),
    {
      ...before,
      ...(expectedCatalog ? { tile_catalog: expectedCatalog } : {}),
    },
  );
  assert.deepEqual(afterDb.query("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    (
      afterDb.query("PRAGMA integrity_check").get() as {
        integrity_check: string;
      }
    ).integrity_check,
    "ok",
  );
  afterDb.close();
  rmSync(work, { recursive: true, force: true });
}
if (stopError) throw stopError;
