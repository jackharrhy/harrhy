import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
import worker from "../worker.ts";

it("dismisses the alternate bookmark notice without navigating", async () => {
  const origin = "https://ref.harrhy.xyz";
  const script = await readFile(
    new URL("../public/assets/move-notice.js", import.meta.url),
    "utf8",
  );
  const env = {
    AUTH_PUBLIC_ORIGIN: "https://old.example",
    HARRHY_REF_ALTERNATE_BROWSER_ORIGIN: origin,
    AUTH_ISSUER: "https://issuer.example",
    AUTH_CLIENT_ID: "client",
    AUTH_PROJECT_ID: "project",
    AUTH_ORGANIZATION_ID: "organization",
    DIRECTORY: {
      getByName: () => ({
        session: async () => true,
        listBoards: async () => [],
      }),
    },
    ASSETS: {
      fetch: () =>
        new Response(script, {
          headers: { "Content-Type": "text/javascript" },
        }),
    },
  } as unknown as Env;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let documentRequests = 0;
    await page.route(`${origin}/**`, async (route) => {
      const request = route.request();
      if (request.isNavigationRequest()) documentRequests++;
      const response = await worker.fetch(
        new Request(request.url(), {
          headers: await request.allHeaders(),
        }),
        env,
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    await page.goto(origin);
    expect(await page.locator("[data-move-notice]").count()).toBe(0);
    await page
      .context()
      .addCookies([
        { name: "ref_session", value: "a".repeat(64), url: origin },
      ]);
    await page.goto(`${origin}/?keep=one&moved=1&keep=two#boards`);
    const notice = page.getByRole("status");
    expect(await notice.innerText()).toBe(
      "Ref is now on ref.harrhy.xyz, please update your bookmarks!",
    );
    expect(await notice.locator("strong").innerText()).toBe("ref.harrhy.xyz");
    expect(
      await notice.evaluate((element) => getComputedStyle(element).textAlign),
    ).toBe("center");
    const dismiss = page.getByRole("button", {
      name: "Dismiss bookmark notice",
    });
    await dismiss.focus();
    await page.keyboard.press("Enter");
    expect(await notice.isVisible()).toBe(false);
    expect(page.url()).toBe(`${origin}/?keep=one&keep=two#boards`);
    expect(documentRequests).toBe(2);
  } finally {
    await browser.close();
  }
});
