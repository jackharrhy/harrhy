import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, type Browser } from "playwright";
import { createRequestListener } from "remix/node-fetch-server";
import { createAppRouter } from "../app/router.ts";
import {
  createSteveSession,
  getSteveAccess,
} from "../app/actions/steve/auth.ts";
import { setSiteEnabled } from "../app/data/site-settings.ts";

const config = {
  AUTH_ISSUER: "https://auth.example.test",
  AUTH_CLIENT_ID: "letters-fixture",
  AUTH_PROJECT_ID: "letters-project",
  AUTH_ORGANIZATION_ID: "letters-org",
  AUTH_PUBLIC_ORIGIN: "https://letters.example.test",
  AUTH_ADMIN_SUBJECT: "fixture-admin",
  AUTH_RECIPIENT_SUBJECT: "fixture-recipient",
};
const previous = Object.fromEntries(
  Object.keys(config).map((key) => [key, process.env[key]]),
);
let app: Awaited<ReturnType<typeof createAppRouter>>;
let server: Server;
let issuer: Server;
let browser: Browser;
let directory: string;
let origin: string;
let authDestination: string;

async function listen(listener: Server) {
  await new Promise<void>((done) => listener.listen(0, "127.0.0.1", done));
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

before(async () => {
  Object.assign(process.env, config);
  issuer = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><h1>Auth fixture</h1>");
  });
  authDestination = `${await listen(issuer)}/login`;
  directory = await mkdtemp(join(tmpdir(), "letters-auth-navigation-"));
  app = await createAppRouter({
    databasePath: ":memory:",
    uploadDirectory: join(directory, "uploads"),
  });
  await setSiteEnabled(app.database, true);
  server = createServer(
    createRequestListener((request) => {
      if (new URL(request.url).pathname === "/auth/login")
        return new Response(null, {
          status: 302,
          headers: { Location: authDestination },
        });
      return app.router.fetch(request);
    }),
  );
  origin = await listen(server);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  for (const listener of [server, issuer]) {
    if (!listener) continue;
    listener.closeAllConnections();
    await new Promise<void>((done) => listener.close(() => done()));
  }
  await app?.database.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("hydrated Steve login follows the protected-route redirect as a document", async () => {
  const page = await browser.newPage();
  const entryRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url() === `${origin}/steve`)
      entryRequests.push(request.resourceType());
  });
  try {
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      Object.assign(window, { fixtureDocument: true });
    });
    await page
      .getByRole("link", { name: "write to steve", exact: true })
      .click();
    await page.waitForURL(`${origin}/write`);
    assert.equal(await page.evaluate(() => "fixtureDocument" in window), true);
    await page.goBack({ waitUntil: "networkidle" });
    await page.getByRole("link", { name: "steve login", exact: true }).click();
    await page.waitForURL(authDestination);
    assert.equal(
      await page.getByRole("heading", { name: "Auth fixture" }).count(),
      1,
    );
    assert.deepEqual(entryRequests, ["document"]);
  } finally {
    await page.close();
  }
});

test("hydrated sign-out posts to the real controller and revokes the disposable session", async () => {
  const context = await browser.newContext();
  const token = await createSteveSession(
    app.database,
    config.AUTH_ADMIN_SUBJECT,
    Math.floor(Date.now() / 1000) + 3600,
  );
  const cookie = `steve_session=${token}`;
  await context.addCookies([
    { name: "steve_session", value: token, url: origin },
  ]);
  const page = await context.newPage();
  const submissions: { method: string; type: string }[] = [];
  page.on("request", (request) => {
    if (request.url() === `${origin}/auth/logout`)
      submissions.push({
        method: request.method(),
        type: request.resourceType(),
      });
  });
  try {
    await page.goto(`${origin}/steve`, { waitUntil: "networkidle" });
    assert.equal(
      await page.getByRole("button", { name: "sign out", exact: true }).count(),
      1,
    );
    await page.evaluate(() => {
      Object.assign(window, { fixtureDocument: true });
    });
    await page.getByRole("button", { name: "sign out", exact: true }).click();
    await page.waitForURL(origin + "/");
    assert.equal(await page.evaluate(() => "fixtureDocument" in window), false);
    assert.deepEqual(submissions, [{ method: "POST", type: "document" }]);
    assert.equal(
      await getSteveAccess(
        new Request(`${origin}/steve`, { headers: { Cookie: cookie } }),
        app.database,
      ),
      "unauthorized",
    );
  } finally {
    await context.close();
  }
});
