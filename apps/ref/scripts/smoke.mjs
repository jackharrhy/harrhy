import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  installFrameGate,
  checkUnconfirmedCard,
  checkBoardLoading,
  checkQueuedMove,
  checkInlineRename,
  checkMacCanvas,
  removeImageByKeyboard,
} from "../__tests__/editor-browser.mjs";
import { chromium, expect } from "@playwright/test";
import {
  installWebMcpTestHost,
  checkWebMcpBrowser,
  checkWebMcpRemoval,
} from "../__tests__/webmcp-browser.mjs";

const base = process.env.REF_SMOKE_URL ?? "http://localhost:8788";
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(base).hostname)) {
  throw new Error("Smoke test only accepts a local URL");
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await installWebMcpTestHost(page);
  await installFrameGate(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { value: "Win32" });
    document.addEventListener("securitypolicyviolation", (event) => {
      window.refCspViolations ??= [];
      window.refCspViolations.push(
        `${event.effectiveDirective}: ${event.blockedURI}`,
      );
    });
  });
  const landing = await page.goto(base);
  const landingCsp = landing?.headers()["content-security-policy"] ?? "";
  assert.match(landingCsp, /style-src[^;]*'nonce-[^']+'/);
  assert.doesNotMatch(landingCsp, /unsafe-inline/);
  const signIn = page.getByRole("link", { name: "Sign in", exact: true });
  assert.equal(
    await page.getByRole("heading", { level: 1 }).textContent(),
    "ref",
  );
  assert.equal(await page.locator(".auth-intro").count(), 0);
  assert.equal(
    await page.getByText("A shared board for images and links.").count(),
    0,
  );
  assert.ok((await signIn.boundingBox()).height >= 46);
  assert.equal(
    await signIn.evaluate((el) => getComputedStyle(el).borderRadius),
    "5px",
  );
  await page.screenshot({ path: join(tmpdir(), "ref-ui-signin-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(tmpdir(), "ref-ui-signin-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  assert.equal((await context.request.post(`${base}/login`)).status(), 404);
  const firstStart = await context.request.get(`${base}/auth/login`, {
    maxRedirects: 0,
  });
  const secondStart = await context.request.get(`${base}/auth/login`, {
    maxRedirects: 0,
  });
  assert.equal(firstStart.status(), 303);
  assert.equal(secondStart.status(), 303);
  const firstCookie = firstStart.headers()["set-cookie"].split("=", 1)[0];
  const secondCookie = secondStart.headers()["set-cookie"].split("=", 1)[0];
  assert.notEqual(firstCookie, secondCookie);
  await page.goto(firstStart.headers().location);
  await page.getByRole("button", { name: "Continue as local user" }).click();
  await page.getByRole("heading", { name: "Boards" }).waitFor();
  assert(
    (await context.cookies(`${base}/auth/login`)).some(
      (entry) => entry.name === secondCookie,
    ),
  );
  await page.goto(secondStart.headers().location);
  await page.getByRole("button", { name: "Continue as local user" }).click();
  await page.getByRole("heading", { name: "Boards" }).waitFor();
  await page.locator("input[name=title]").fill("Smoke board");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/boards\/[0-9a-f-]+/);
  const boardId = page.url().split("/").at(-1);
  await page.locator("#connection.online").waitFor();
  await checkMacCanvas(context, page.url());
  const addImages = page.getByRole("button", { name: "Add images" });
  const addLink = page.locator("#link-menu summary");
  assert.ok((await addImages.boundingBox()).height >= 40);
  assert.ok((await addLink.boundingBox()).height >= 40);
  await addLink.focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#link-menu").getAttribute("open"), "");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#link-menu").getAttribute("open"), null);
  await page.screenshot({ path: join(tmpdir(), "ref-ui-board-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(tmpdir(), "ref-ui-board-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  const boardCsp = (await context.request.get(page.url())).headers()[
    "content-security-policy"
  ];
  assert.match(boardCsp, /worker-src 'self'/);
  assert.match(boardCsp, /media-src 'self' https:\/\/video\.twimg\.com/);

  const second = await context.newPage();
  second.on("pageerror", (error) => errors.push(error.message));
  await installFrameGate(second, "ready");
  await second.goto(`${base}/boards/${boardId}`);
  await second.waitForFunction(() => !!window.refReleaseFrame);
  await expect(second.locator(".connection-text")).toHaveText("Connecting");
  await expect(second.locator("#board-loading")).toBeVisible();
  await expect(second.locator("#empty-state")).toBeHidden();
  await second.evaluate(() => window.refReleaseFrame());
  await second.locator("#connection.online").waitFor();
  await expect(second.locator("#empty-state")).toBeVisible();
  await expect(second.locator("#board-loading")).toBeHidden();

  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.evaluate(() => {
    window.refHoldFrame = "applied";
  });
  await page.locator("#file-input").setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: image,
  });
  await page.locator(".board-item").waitFor();
  await second.locator(".board-item").waitFor();
  const itemId = await page.locator(".board-item").getAttribute("data-item-id");
  assert.equal(
    await second.locator(".board-item").getAttribute("data-item-id"),
    itemId,
  );
  await checkUnconfirmedCard(page);
  await checkBoardLoading(context, page.url());
  await checkWebMcpBrowser(page, second, itemId);
  await page.locator(".board-item img[src]").waitFor();
  const mediaPath = await page
    .locator(".board-item img")
    .getAttribute("data-original");
  assert.ok(mediaPath);
  const mediaUrl = `${base}${mediaPath}`;
  const mediaResponse = await context.request.get(mediaUrl);
  assert.equal(mediaResponse.status(), 200);
  assert.equal(mediaResponse.headers()["cache-control"], "private, no-cache");
  const mediaEtag = mediaResponse.headers().etag;
  assert.ok(mediaEtag);
  assert.equal(
    (
      await context.request.get(mediaUrl, {
        headers: { "If-None-Match": mediaEtag },
      })
    ).status(),
    304,
  );
  const anonymous = await browser.newContext();
  assert.equal(
    (
      await anonymous.request.get(`${base}/api/boards/${boardId}/snapshot`)
    ).status(),
    404,
  );
  assert.equal((await anonymous.request.get(mediaUrl)).status(), 404);

  assert.equal(
    await page.locator("#scroll-mode").getAttribute("aria-pressed"),
    "false",
  );
  await page.locator("#scroll-mode").click();
  const viewBeforePan = await page
    .locator("#world")
    .evaluate((element) => element.style.transform);
  const zoomBeforePan = await page.locator("#zoom-label").textContent();
  await page.mouse.move(800, 700);
  await page.mouse.wheel(90, 60);
  await page.waitForFunction(
    (before) => document.querySelector("#world")?.style.transform !== before,
    viewBeforePan,
  );
  assert.equal(await page.locator("#zoom-label").textContent(), zoomBeforePan);
  await page.locator("#scroll-mode").click();
  const documentScroll = await page.evaluate(() => ({
    x: scrollX,
    y: scrollY,
  }));
  const anchorBefore = await page.locator("#world").evaluate((element) => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    const rect = document.querySelector("#viewport").getBoundingClientRect();
    return {
      x: (800 - rect.left - matrix.e) / matrix.a,
      y: (700 - rect.top - matrix.f) / matrix.d,
    };
  });
  await page.mouse.move(800, 700);
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(
    (before) => document.querySelector("#zoom-label")?.textContent !== before,
    zoomBeforePan,
  );

  const anchorAfter = await page.locator("#world").evaluate((element) => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    const rect = document.querySelector("#viewport").getBoundingClientRect();
    return {
      x: (800 - rect.left - matrix.e) / matrix.a,
      y: (700 - rect.top - matrix.f) / matrix.d,
    };
  });
  assert.ok(Math.abs(anchorBefore.x - anchorAfter.x) < 0.01);
  assert.ok(Math.abs(anchorBefore.y - anchorAfter.y) < 0.01);
  assert.deepEqual(
    await page.evaluate(() => ({ x: scrollX, y: scrollY })),
    documentScroll,
  );
  // Browser zoom/scroll and control keys remain native outside the canvas.
  for (const selector of ["#link-url", "#zoom-in"]) {
    assert.equal(
      await page.locator(selector).evaluate((element) => {
        const wheel = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: 100,
        });
        element.dispatchEvent(wheel);
        const key = new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Space",
          key: " ",
        });
        element.dispatchEvent(key);
        return wheel.defaultPrevented || key.defaultPrevented;
      }),
      false,
    );
  }
  assert.equal(
    await page.locator("#viewport").evaluate((element) => {
      element.focus();
      const key = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "Space",
        key: " ",
      });
      element.dispatchEvent(key);
      element.dispatchEvent(
        new KeyboardEvent("keyup", { bubbles: true, code: "Space" }),
      );
      return key.defaultPrevented;
    }),
    true,
  );

  const before = await second
    .locator(".board-item")
    .evaluate((element) => element.style.left);
  const bounds = await page.locator(".board-item").boundingBox();
  assert.ok(bounds);
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 80,
    bounds.y + bounds.height / 2 + 30,
    {
      steps: 5,
    },
  );
  await page.mouse.up();
  await second.waitForFunction(
    (old) => document.querySelector(".board-item")?.style.left !== old,
    before,
  );
  await second.reload();
  await second.waitForFunction(() => !!window.refReleaseFrame);
  await second.evaluate(() => window.refReleaseFrame());
  await second.locator("#connection.online").waitFor();
  assert.notEqual(
    await second
      .locator(".board-item")
      .evaluate((element) => element.style.left),
    before,
  );

  await page.locator("#link-menu summary").click();
  // Miss the first link broadcast. The next link exposes a real sequence gap.
  await second.evaluate(() => {
    window.refHoldFrame = "applied";
  });
  await page.locator("#link-url").fill("https://example.com/");
  await page.locator("#link-form button").click();
  await page.locator(".link-item").waitFor({ timeout: 20_000 });
  await second.waitForFunction(() => !!window.refReleaseFrame);
  await second.evaluate(() => {
    window.refReleaseFrame = null;
    window.refHoldFrame = "ready";
  });
  const failedProbe = second.waitForResponse(
    (response) =>
      response.url().endsWith("/snapshot") && response.status() === 503,
  );
  await second.route("**/snapshot", (route) => route.fulfill({ status: 503 }), {
    times: 1,
  });
  assert.match(await page.locator(".link-card").innerText(), /example\.com/i);
  assert.equal(
    await page.evaluate(
      (id) =>
        fetch(`/api/boards/${id}/links`, {
          method: "POST",
          body: new URLSearchParams({ url: "http://127.0.0.1/" }),
        }).then((response) => response.status),
      boardId,
    ),
    400,
  );
  await page.locator("#link-menu summary").click();
  await page.locator("#link-url").fill("https://example.com/");
  await page.locator("#link-form button").click();
  assert.equal(await page.locator(".link-item").count(), 1);
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "https://example.org/");
    document.querySelector("#viewport")?.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: 450,
        clientY: 350,
      }),
    );
  });
  await page.locator(".link-item").nth(1).waitFor({ timeout: 20_000 });
  await failedProbe;
  await checkQueuedMove(page, second, itemId);
  await second.locator(".link-item").nth(1).waitFor();
  await page.reload();
  await page.locator(".link-item").nth(1).waitFor();

  await checkInlineRename(page);
  await checkWebMcpRemoval(page, second);
  await removeImageByKeyboard(page);
  await page
    .locator(`.board-item[data-item-id="${itemId}"]`)
    .waitFor({ state: "detached" });
  await second
    .locator(`.board-item[data-item-id="${itemId}"]`)
    .waitFor({ state: "detached" });
  assert.equal((await context.request.get(mediaUrl)).status(), 404);
  await page.evaluate(() => {
    window.refTestBeforeLogoutContext =
      window.refTestBrowserTools.get("ref_board_context");
  });
  await page.evaluate(async () => fetch("/logout", { method: "POST" }));
  await page.waitForFunction(() => window.refTestBrowserTools.size === 0);
  assert.equal(
    await page.evaluate(async () => {
      try {
        await window.refTestBeforeLogoutContext.execute(
          { offset: 0 },
          { signal: new AbortController().signal },
        );
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  await expect(page.locator(".connection-text")).toHaveText("Access ended");
  await expect(addImages).toBeDisabled();
  await expect(page.locator(".board-item")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to boards" }),
  ).toBeVisible();
  assert.equal(
    (
      await context.request.get(`${base}/api/boards/${boardId}/snapshot`)
    ).status(),
    404,
  );
  assert.equal(
    await page.evaluate(
      (url) => fetch(url).then((response) => response.status),
      mediaUrl,
    ),
    404,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    await page.evaluate(() => window.refCspViolations ?? []),
    [],
  );
  console.log(
    JSON.stringify({
      ok: true,
      boardId,
      itemId,
      liveSync: true,
      persistence: true,
      privateMedia: true,
      linkPreview: true,
      mediaCleanup: true,
      logout: true,
    }),
  );
} finally {
  await browser.close();
}
