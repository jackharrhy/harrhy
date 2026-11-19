import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as http } from "node:http";
import { createServer as https } from "node:https";
import type { Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createRequestListener } from "remix/node-fetch-server";
import { expect, test, vi } from "vitest";

// Use the production policy builder at this cross-service test boundary only.
import { contentSecurityPolicy } from "../../auth/src/security.mjs";
import { identityFetch } from "./identity-fixture.ts";
import { createRouterHarness, router } from "./router-harness.ts";

test("Auth form POST lands on Artbin before a user click delivers and redeems the loopback handoff", async () => {
  const harness = await createRouterHarness();
  const temp = mkdtempSync(join(tmpdir(), "artbin-cli-completion-"));
  const servers: Server[] = [];
  vi.stubEnv("HARRHY_ARTBIN_BROWSER_ORIGIN", "");
  vi.stubEnv("NODE_ENV", "production");
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  async function listen(server: Server, scheme: string) {
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test listener");
    return `${scheme}://127.0.0.1:${address.port}`;
  }
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        join(temp, "key"),
        "-out",
        join(temp, "cert"),
        "-days",
        "1",
        "-subj",
        "/CN=127.0.0.1",
      ],
      { stdio: "ignore" },
    );
    const tls = {
      key: readFileSync(join(temp, "key")),
      cert: readFileSync(join(temp, "cert")),
    };
    let received: { code: string; referrer: string | undefined } | undefined;
    const loopback = await listen(
      http((request, response) => {
        const url = new URL(request.url!, "http://127.0.0.1");
        const code = url.searchParams.get("code");
        if (request.method !== "GET" || url.pathname !== "/callback" || !code) {
          response.writeHead(404).end();
          return;
        }
        received = { code, referrer: request.headers.referer };
        response.end("Synthetic CLI listener received the handoff");
      }),
      "http",
    );
    let callback: URL;
    let formPosts = 0;
    const auth = await listen(
      https(tls, (request, response) => {
        if (request.url === "/submit" && request.method === "POST") {
          formPosts++;
          response.writeHead(303, { Location: callback.href }).end();
          return;
        }
        response
          .writeHead(200, {
            "Content-Type": "text/html",
            "Content-Security-Policy": contentSecurityPolicy(callback.href),
          })
          .end(
            '<form method="post" action="/submit"><button>Authorize</button></form>',
          );
      }),
      "https",
    );
    const artbin = await listen(
      https(
        tls,
        createRequestListener(async (request) => {
          const response = await router.fetch(request);
          if (
            new URL(request.url).pathname === "/auth/cli/authorize" &&
            response.status === 302
          ) {
            const provider = new URL(response.headers.get("Location")!);
            callback = new URL(provider.searchParams.get("redirect_uri")!);
            callback.searchParams.set("code", "synthetic-authorization");
            callback.searchParams.set(
              "state",
              provider.searchParams.get("state")!,
            );
            vi.stubGlobal(
              "fetch",
              identityFetch(provider.searchParams.get("nonce")!),
            );
            response.headers.set("Location", auth + "/consent");
          }
          return response;
        }),
      ),
      "https",
    );
    vi.stubEnv("ARTBIN_URL", artbin);
    vi.stubGlobal("fetch", identityFetch());

    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const consent = await page.goto(
        `${artbin}/auth/cli/authorize?port=${new URL(loopback).port}`,
      );
      expect(consent?.headers()["content-security-policy"]).toContain(
        `form-action 'self' ${artbin};`,
      );
      const completionRequest = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/auth/cli/callback",
      );
      const assets: string[] = [];
      page.on("request", (request) => {
        if (!request.isNavigationRequest()) assets.push(request.resourceType());
      });
      await page.getByRole("button", { name: "Authorize" }).click();
      const completion = await completionRequest;
      expect(formPosts).toBe(1);
      expect(completion.status()).toBe(200);
      expect(completion.headers()["cache-control"]).toContain("no-store");
      expect(completion.headers()["referrer-policy"]).toBe("no-referrer");
      expect(completion.headers().location).toBeUndefined();
      await page.waitForLoadState("load");
      expect(new URL(page.url()).origin).toBe(artbin);
      expect(received).toBeUndefined();
      await page.getByRole("link", { name: "Continue to CLI" }).click();
      await page
        .getByText("Synthetic CLI listener received the handoff")
        .waitFor();
      expect(assets).toEqual([]);
      expect(received?.referrer).toBeUndefined();
      const code = received?.code;
      expect(Boolean(code)).toBe(true);
      function redeem() {
        return router.fetch(
          harness.request("/auth/cli/redeem", undefined, {
            method: "POST",
            body: JSON.stringify({ code }),
          }),
        );
      }
      expect((await redeem()).status).toBe(200);
      expect((await redeem()).status).toBe(400);
      const logs = JSON.stringify([info.mock.calls, warn.mock.calls]);
      expect(logs.includes(code!)).toBe(false);
    } finally {
      await browser.close();
    }
  } finally {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    harness.close();
    rmSync(temp, { recursive: true, force: true });
  }
}, 30_000);
