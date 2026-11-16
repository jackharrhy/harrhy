import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { after, before, test } from "node:test";
import { chromium, type Browser } from "playwright";
import { createRequestListener } from "remix/node-fetch-server";
import { jsx } from "remix/component/jsx-runtime";
import { renderToString } from "remix/component/server";
import { Document } from "../app/ui/document.tsx";
import { RoomLobby } from "../app/ui/room-lobby.tsx";

let browser: Browser;
let radio: Server;
let issuer: Server;
let origin: string;
let issuerOrigin: string;
const clientRoot = resolve(import.meta.dirname, "../dist/client");
const requests: { pathname: string; method: string }[] = [];

async function listen(server: Server) {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

before(async () => {
  issuer = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(
      "<!doctype html><title>Auth fixture</title><h1>Auth fixture</h1>",
    );
  });
  issuerOrigin = await listen(issuer);
  radio = createServer(
    createRequestListener(async (request) => {
      const url = new URL(request.url);
      requests.push({ pathname: url.pathname, method: request.method });
      if (url.pathname === "/auth/login")
        return new Response(null, {
          status: 302,
          headers: { Location: `${issuerOrigin}/login` },
        });
      if (url.pathname === "/logout" && request.method === "POST")
        return new Response(null, { status: 303, headers: { Location: "/" } });
      if (url.pathname === "/" || url.pathname === "/signed-in") {
        const html = await renderToString(
          jsx(Document, {
            children: jsx(RoomLobby, {
              rooms: [{ slug: "cozy", name: "Cozy", createdAt: 0 }],
              selectedRoom: "cozy",
              identity:
                url.pathname === "/signed-in"
                  ? {
                      name: "Fixture listener",
                      subject: "fixture-subject",
                      authenticatedAt: 0,
                      expiresAt: Number.MAX_SAFE_INTEGER,
                    }
                  : null,
            }),
          }),
        );
        return new Response(html, {
          headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
        });
      }
      const file = resolve(clientRoot, `.${url.pathname}`);
      if (!file.startsWith(clientRoot + sep))
        return new Response(null, { status: 404 });
      try {
        const bytes = await readFile(file);
        const type = file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : "application/octet-stream";
        return new Response(bytes, { headers: { "Content-Type": type } });
      } catch {
        return new Response(null, { status: 404 });
      }
    }),
  );
  origin = await listen(radio);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  for (const server of [radio, issuer]) {
    if (!server) continue;
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test("hydrated sign-in follows the cross-origin redirect as a document and works after Back", async () => {
  const page = await browser.newPage();
  const authRequests: { type: string; document: boolean }[] = [];
  page.on("request", (request) => {
    if (request.url() === `${origin}/auth/login`)
      authRequests.push({
        type: request.resourceType(),
        document: request.isNavigationRequest(),
      });
  });
  try {
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      Object.assign(window, { fixtureDocument: true });
    });
    await page.getByRole("button", { name: "Cozy, selected" }).click();
    await page.waitForURL(`${origin}/?room=cozy`);
    assert.equal(await page.evaluate(() => "fixtureDocument" in window), true);
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.waitForURL(`${issuerOrigin}/login`);
    assert.equal(
      await page.getByRole("heading", { name: "Auth fixture" }).count(),
      1,
    );
    assert.deepEqual(authRequests, [{ type: "document", document: true }]);
    await page.goBack({ waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Sign in", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(`${issuerOrigin}/login`);
    assert.deepEqual(authRequests, [
      { type: "document", document: true },
      { type: "document", document: true },
    ]);
  } finally {
    await page.close();
  }
});

test("sign-in keeps native new-tab and no-script navigation", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(origin, { waitUntil: "networkidle" });
    for (const options of [
      { button: "middle" as const },
      { modifiers: ["ControlOrMeta" as const] },
    ]) {
      const opened = context.waitForEvent("page");
      await page
        .getByRole("link", { name: "Sign in", exact: true })
        .click(options);
      const tab = await opened;
      await tab.waitForURL(`${issuerOrigin}/login`);
      assert.equal(page.url(), origin + "/");
      await tab.close();
    }
  } finally {
    await context.close();
  }
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  try {
    const noScriptPage = await noScript.newPage();
    await noScriptPage.goto(origin);
    await noScriptPage
      .getByRole("link", { name: "Sign in", exact: true })
      .click();
    await noScriptPage.waitForURL(`${issuerOrigin}/login`);
    await noScriptPage.goto(`${origin}/auth/login`);
    assert.equal(noScriptPage.url(), `${issuerOrigin}/login`);
  } finally {
    await noScript.close();
  }
});

test("sign-out submits natively and discards the old document", async () => {
  const page = await browser.newPage();
  const logoutRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url() === `${origin}/logout`)
      logoutRequests.push(request.resourceType());
  });
  try {
    await page.goto(`${origin}/signed-in`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      Object.assign(window, { fixtureDocument: true });
    });
    await page.getByRole("button", { name: "sign out", exact: true }).click();
    await page.waitForURL(origin + "/");
    assert.equal(await page.evaluate(() => "fixtureDocument" in window), false);
    assert.deepEqual(logoutRequests, ["document"]);
    assert.ok(
      requests.some(
        (request) =>
          request.pathname === "/logout" && request.method === "POST",
      ),
    );
  } finally {
    await page.close();
  }
});
