import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { chromium } from "playwright";
import { authorizationFixture } from "../fixtures/authorization-server.mjs";

const fixture = await authorizationFixture();
let browser, server, exited;
try {
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [new URL("../../src/server.mjs", import.meta.url).pathname],
    {
      env: { ...fixture.env, PORT: String(port), PUBLIC_ORIGIN: origin },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  exited = once(server, "exit");
  const output = createInterface({ input: server.stdout });
  await Promise.race([
    (async () => {
      for await (const line of output) if (line === "auth listening") return;
      throw new Error("Auth did not announce startup");
    })(),
    exited.then(() => {
      throw new Error("Auth exited before startup");
    }),
  ]);
  server.stdout.resume();
  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const cspViolations = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy"))
      cspViolations.push(message.text());
  });
  const entry = `${origin}/login?authRequest=first`;
  const callback = `${fixture.callbackOrigin}/callback?code=fixture-code&state=fixture-state`;
  const response = await page.goto(entry);
  const nonce = await page
    .locator("style[nonce]")
    .first()
    .evaluate((style) => style.nonce);
  const csp = response.headers()["content-security-policy"];
  assert(nonce && csp.includes(`'nonce-${nonce}'`));
  assert.equal(fixture.counts().credentialAttempts, 0);
  await page.getByLabel("Username or email").fill("fixture-user");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  const submitted = page.waitForRequest(
    (request) =>
      request.url() === `${origin}/login` && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const post = await submitted;
  assert(post.isNavigationRequest());
  assert.equal(await post.headerValue("origin"), origin);
  await page.waitForURL(callback);
  assert.equal(
    await page.locator("h1").innerText(),
    "Consumer session established",
  );
  const session = (await context.cookies(origin)).find(
    (cookie) => cookie.name === "__Host-jack_auth",
  );
  assert(session?.secure && session.httpOnly && session.sameSite === "Lax");
  await page.goto(`${origin}/login?authRequest=returning`);
  await page.waitForURL(callback);
  assert.equal(fixture.counts().credentialAttempts, 1);
  assert.equal(fixture.counts().completions, 2);
  assert.deepEqual(cspViolations, []);
  console.log(
    "PASS native document sign-in, cross-origin callback, and session cookie reuse",
  );
} finally {
  await browser?.close();
  server?.kill();
  await exited;
  await fixture.close();
}
