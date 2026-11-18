import { createServer, request as httpRequest } from "node:http";
import { chromium } from "playwright";
import { createRequestListener } from "remix/node-fetch-server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { identityFetch } from "./identity-fixture.ts";
import { createRouterHarness, router } from "./router-harness.ts";

const canonical = "https://artbin.test";
const alternate = "https://archive.test";
let harness: Awaited<ReturnType<typeof createRouterHarness>>;

beforeEach(async () => {
  harness = await createRouterHarness();
  vi.stubEnv("ARTBIN_URL", canonical);
  vi.stubEnv("HARRHY_ARTBIN_BROWSER_ORIGIN", alternate);
  vi.stubGlobal("fetch", identityFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  harness.close();
});

async function start(origin: string, path = "/auth/login") {
  const response = await router.fetch(new Request(origin + path));
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location")!);
  const header = response.headers.get("set-cookie")!;
  expect(header).toContain("HttpOnly; SameSite=Lax");
  expect(header).not.toMatch(/;\s*Domain=/i);
  return { params: location.searchParams, cookie: header.split(";")[0]! };
}

test("starts and exchanges browser OAuth on its own host without sharing session cookies", async () => {
  const old = await start(canonical);
  const browser = await start(alternate);
  expect(old.params.get("redirect_uri")).toBe(canonical + "/auth/callback");
  expect(browser.params.get("redirect_uri")).toBe(alternate + "/auth/callback");
  const token = vi.fn();
  vi.stubGlobal("fetch", identityFetch(browser.params.get("nonce")!, token));
  const callback = `/auth/callback?code=test-code&state=${browser.params.get("state")}`;

  const wrong = await router.fetch(
    new Request(canonical + callback, {
      headers: { Cookie: browser.cookie },
    }),
  );
  expect(wrong.headers.get("location")).toBe("/login?error=state_mismatch");
  expect(token).not.toHaveBeenCalled();

  const result = await router.fetch(
    new Request(alternate + callback, {
      headers: { Cookie: `${old.cookie}; ${browser.cookie}` },
    }),
  );
  expect(result.headers.get("location")).toBe("/folders");
  expect(token).toHaveBeenCalledOnce();
  expect(token.mock.calls[0]![0].get("redirect_uri")).toBe(
    alternate + "/auth/callback",
  );
  const [clear, session] = result.headers.getSetCookie();
  expect(clear).toMatch(/artbin_oauth_.*Max-Age=0/);
  expect(session).toMatch(
    /^artbin_session=.*; Path=\/; HttpOnly; SameSite=Lax/,
  );
  expect(session).not.toMatch(/;\s*Domain=/i);
});

test("isolates legacy endpoint namespaces and keeps canonical discovery and CLI callbacks", async () => {
  for (const [method, path] of [
    ["GET", "/auth/cli/authorize?port=12345"],
    ["GET", "/auth/cli/callback"],
    ["POST", "/auth/cli/redeem"],
    ["GET", "/api/cli/whoami"],
    ["GET", "/api/assets"],
    ["GET", "/mcp"],
    ["POST", "/mcp"],
    ["GET", "/.well-known/oauth-protected-resource/mcp"],
    ["GET", "/auth/support/start"],
    ["GET", "/auth/support/recover"],
    ["POST", "/auth/support/eligibility"],
    ["POST", "/auth/support/exit"],
  ] as const) {
    expect(
      (await router.fetch(new Request(alternate + path, { method }))).status,
      path,
    ).toBe(404);
  }
  const metadata = await router.fetch(
    new Request(canonical + "/.well-known/oauth-protected-resource/mcp"),
  );
  expect((await metadata.json()).resource).toBe(canonical + "/mcp");
  const cli = await start(canonical, "/auth/cli/authorize?port=12345");
  expect(cli.params.get("redirect_uri")).toBe(canonical + "/auth/cli/callback");
});

test("shows only a fixed alternate sign-in notice and keeps origin handling opt-in", async () => {
  expect(
    await (
      await router.fetch(new Request(alternate + "/login?moved=1"))
    ).text(),
  ).toContain("Artbin has a new browser address.");
  expect(
    await (
      await router.fetch(new Request(canonical + "/login?moved=1"))
    ).text(),
  ).not.toContain("Artbin has a new browser address.");
  vi.stubEnv("HARRHY_ARTBIN_BROWSER_ORIGIN", "");
  expect((await start(alternate)).params.get("redirect_uri")).toBe(
    canonical + "/auth/callback",
  );
});

test("Node ingress uses public Host, without trusting forwarded origin headers", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const server = createServer(
    createRequestListener((request) => router.fetch(request)),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test listener");
  function get(host: string, forwardedHost: string) {
    return new Promise<import("node:http").IncomingMessage>(
      (resolve, reject) => {
        httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/auth/login",
            headers: {
              Host: host,
              Forwarded: `host=${forwardedHost};proto=http`,
              "X-Forwarded-Host": forwardedHost,
              "X-Forwarded-Proto": "http",
            },
          },
          (response) => {
            response.resume();
            resolve(response);
          },
        )
          .on("error", reject)
          .end();
      },
    );
  }
  try {
    const response = await get("archive.test", "artbin.test");
    expect(response.statusCode).toBe(302);
    expect(
      new URL(response.headers.location!).searchParams.get("redirect_uri"),
    ).toBe(alternate + "/auth/callback");
    expect(response.headers["set-cookie"]?.[0]).toMatch(/; Secure$/);
    expect((await get("unknown.test", "archive.test")).statusCode).toBe(421);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Chromium keeps the alternate session on its own hostname and logs out by document navigation", async () => {
  const server = createServer(
    createRequestListener(async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/mock-authorize") {
        if (request.headers.get("Sec-Fetch-Mode") !== "navigate") {
          return new Response("Expected document navigation", { status: 400 });
        }
        vi.stubGlobal("fetch", identityFetch(url.searchParams.get("nonce")!));
        const callback = new URL(url.searchParams.get("redirect_uri")!);
        callback.searchParams.set("code", "synthetic-code");
        callback.searchParams.set("state", url.searchParams.get("state")!);
        return Response.redirect(callback);
      }
      const response = await router.fetch(request);
      if (url.pathname === "/auth/login" && response.status === 302) {
        const provider = new URL(response.headers.get("Location")!);
        response.headers.set(
          "Location",
          old + "/mock-authorize" + provider.search,
        );
      }
      return response;
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test listener");
  const old = `http://127.0.0.1:${address.port}`;
  const next = `http://localhost:${address.port}`;
  vi.stubEnv("ARTBIN_URL", old);
  vi.stubEnv("HARRHY_ARTBIN_BROWSER_ORIGIN", next);
  try {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      await page.goto(next + "/login?moved=1");
      await page.getByRole("link", { name: "Sign in" }).click();
      await page.waitForURL(next + "/folders");
      expect(
        (await context.cookies(old)).some(
          ({ name }) => name === "artbin_session",
        ),
      ).toBe(false);
      expect(
        (await context.cookies(next)).find(
          ({ name }) => name === "artbin_session",
        ),
      ).toMatchObject({ domain: "localhost", httpOnly: true, sameSite: "Lax" });
      await page.goto(old + "/folders");
      await page.waitForURL(old + "/login");
      await page.goto(next + "/settings");
      await page.getByRole("button", { name: "Logout" }).click();
      await page.waitForURL(next + "/login");
      expect(
        (await context.cookies(next)).some(
          ({ name }) => name === "artbin_session",
        ),
      ).toBe(false);
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 30_000);
