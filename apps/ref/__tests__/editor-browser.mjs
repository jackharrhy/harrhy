import { expect } from "@playwright/test";

// Delay or drop one incoming frame without replacing the authorized socket or
// changing the server's state. Other tabs still receive the real broadcast.
export async function installFrameGate(page, initial = null) {
  await page.addInitScript((firstType) => {
    window.refHoldFrame = firstType;
    window.WebSocket = class extends WebSocket {
      constructor(...args) {
        super(...args);
        if (this.url.endsWith("/ws")) window.refDropEditor = () => this.close();
        this.addEventListener("message", (event) => {
          if (JSON.parse(event.data).type !== window.refHoldFrame) return;
          window.refHoldFrame = null;
          event.stopImmediatePropagation();
          window.refReleaseFrame = () => {
            window.refReleaseFrame = null;
            this.dispatchEvent(
              new MessageEvent("message", { data: event.data }),
            );
          };
        });
      }
    };
  }, initial);
}

// Use an isolated cache so a previously decoded thumbnail cannot satisfy the gate.
export async function checkBoardLoading(context, url) {
  const isolated = await context
    .browser()
    .newContext({ storageState: await context.storageState() });
  const page = await isolated.newPage();
  const gate = Promise.withResolvers();
  let fail = false;
  try {
    await installFrameGate(page, "ready");
    await page.route("**/assets/thumb-worker.js", (r) =>
      r.fulfill({ contentType: "application/javascript", body: "" }),
    );
    await page.route("**/media/**", async (r) => {
      await gate.promise;
      if (fail) await r.fulfill({ status: 503, body: "Unavailable" });
      else await r.continue();
    });
    await page.goto(url);
    const loading = page.getByText("Loading board…", { exact: true });
    const card = page.locator(".board-item");
    const image = card.locator("img");
    await page.waitForFunction(() => !!window.refReleaseFrame);
    await expect(loading).toBeVisible();
    await expect(page.locator("#empty-state")).toBeHidden();
    await page.evaluate(() => window.refReleaseFrame());
    await expect(loading).toBeHidden();
    await expect(image).toHaveCSS("opacity", "0");
    await expect(card).toHaveCSS("animation-name", "ref-image-shimmer");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(card).toHaveCSS("animation-name", "none");
    gate.resolve();
    await expect(image).toHaveCSS("opacity", "1");
    await expect(image).toHaveCSS("transition-duration", "0s");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(image).toHaveCSS("transition-duration", "0.16s");
    await page.evaluate(() => {
      window.refHoldFrame = "ready";
      window.refDropEditor();
    });
    await page.waitForFunction(() => !!window.refReleaseFrame);
    await expect(loading).toBeHidden();
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS("opacity", "1");
    await page.evaluate(() => window.refReleaseFrame());
    fail = true;
    await page.reload();
    await page.waitForFunction(() => !!window.refReleaseFrame);
    await page.evaluate(() => window.refReleaseFrame());
    await expect(
      page.getByText("Image unavailable", { exact: true }),
    ).toBeVisible();
    await expect(card).toHaveCSS("animation-name", "none");
  } finally {
    gate.resolve();
    await isolated.close();
  }
}

async function dragCard(page, card) {
  const box = await card.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 32, y);
  await page.mouse.up();
}

export async function checkUnconfirmedCard(page) {
  await page.waitForFunction(() => !!window.refReleaseFrame);
  const card = page.locator(".board-item");
  const left = await card.evaluate((el) => el.style.left);
  await dragCard(page, card);
  await page.keyboard.press("Delete");
  await expect(card).toHaveCount(1);
  expect(await card.evaluate((el) => el.style.left)).toBe(left);
  await page.evaluate(() => window.refReleaseFrame());
}

// Exercise the platform default without claiming to emulate trackpad hardware.
export async function checkMacCanvas(context, url) {
  const page = await context.newPage();
  try {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "platform", { value: "MacIntel" }),
    );
    await page.goto(url);
    await page.locator("#connection.online").waitFor();
    const mode = page.locator("#scroll-mode");
    await expect(mode).toHaveText("Scroll: Pan");
    const camera = () =>
      page.locator("#world").evaluate((el) => {
        const { a, e, f } = new DOMMatrix(getComputedStyle(el).transform);
        return { scale: a, x: e, y: f };
      });
    const before = await camera();
    await page.mouse.move(600, 450);
    await page.mouse.wheel(0, 100);
    await expect.poll(camera).toEqual({ ...before, y: before.y - 100 });
    const canvas = page.locator("#viewport");
    await canvas.dispatchEvent("wheel", {
      ctrlKey: true,
      deltaY: -3,
      clientX: 600,
      clientY: 450,
    });
    await expect
      .poll(async () => (await camera()).scale)
      .toBeGreaterThan(before.scale);
    // WebKit reports scale relative to gesturestart, not to the last change.
    const pinchStart = (await camera()).scale;
    await canvas.evaluate((el) => {
      for (const [type, scale] of [
        ["gesturestart", 1],
        ["gesturechange", 1.1],
        ["gesturechange", 1.2],
        ["gestureend", 1.2],
      ]) {
        const event = Object.assign(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: 600,
            clientY: 450,
          }),
          { scale },
        );
        el.dispatchEvent(event);
      }
    });
    await expect
      .poll(async () => (await camera()).scale)
      .toBeCloseTo(pinchStart * 1.2, 4);
    await mode.click();
    await page.reload();
    await expect(mode).toHaveText("Scroll: Zoom");
  } finally {
    await page.close();
  }
}

export async function removeImageByKeyboard(page) {
  const picker = page.getByRole("combobox", { name: "Choose card" });
  await expect(picker).toHaveCSS("clip-path", "inset(50%)");
  const clipped = await picker.boundingBox();
  expect(clipped.width).toBeLessThanOrEqual(1);
  expect(clipped.height).toBeLessThanOrEqual(1);
  await page.getByRole("textbox", { name: "Board name" }).focus();
  await page.keyboard.press("Tab");
  await expect(picker).toBeFocused();
  await expect(picker).toHaveCSS("clip-path", "none");
  expect(
    await picker.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        h = el.closest("header").getBoundingClientRect();
      return (
        r.width > 20 &&
        r.height > 20 &&
        r.top >= h.top &&
        r.bottom <= h.bottom &&
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el
      );
    }),
  ).toBe(true);
  expect(
    await picker.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).not.toBe("none");
  await page.keyboard.press("s"); // type-ahead: sample.png
  await expect(page.locator("#inspector h3")).toHaveText("sample.png");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter"); // close details, return to picker
  await expect(picker).toBeFocused();
  await page.keyboard.press("s");
  await page.keyboard.press("Tab"); // close details
  await page.keyboard.press("Tab"); // open original
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Remove image" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(picker).toBeFocused();
}

export async function checkQueuedMove(page, second, id) {
  await second.waitForFunction(() => !!window.refReleaseFrame);
  await expect(second.locator(".connection-text")).toHaveText("Reconnecting");
  const selector = `.board-item[data-item-id="${id}"]`;
  const card = second.locator(selector);
  const left = await card.evaluate((el) => el.style.left);
  await dragCard(second, card);
  const moved = await card.evaluate((el) => el.style.left);
  expect(moved).not.toBe(left);
  await expect(second.locator("#toast")).toContainText("queued");
  await second.evaluate(() => window.refReleaseFrame());
  await expect(second.locator(".connection-text")).toHaveText("Live");
  await expect(page.locator(selector)).toHaveCSS("left", moved);
  await expect(card).toHaveCSS("left", moved);
}

export async function checkInlineRename(page) {
  const title = page.getByRole("textbox", { name: "Board name" });
  const documentStart = await page.evaluate(() => performance.timeOrigin);
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/rename"))
      posts++;
  });
  await title.fill("  Title on blur  ");
  await title.press("Tab");
  await expect(title).toHaveValue("Title on blur");
  await expect(page).toHaveTitle("Title on blur · ref");

  await title.fill("Discard me");
  await title.press("Escape");
  await title.press("Tab");
  await expect(title).toHaveValue("Title on blur");

  await title.fill(" ");
  await title.press("Tab");
  await expect(page.locator("#toast")).toContainText("Name not saved");
  await expect(title).toHaveValue("Title on blur");
  await page.route("**/rename", (route) => route.abort(), { times: 1 });
  await title.fill("Not confirmed");
  await title.press("Enter");
  await expect(page.locator("#toast")).toContainText("Rename not confirmed");
  await expect(title).toHaveValue("Title on blur");

  await title.fill("Renamed board");
  await title.press("Enter");
  await title.press("Tab");
  await expect(page).toHaveTitle("Renamed board · ref");
  expect(posts).toBe(4);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStart);

  // Native Enter still submits to the same action without the editor script.
  const native = await page
    .context()
    .browser()
    .newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
    });
  try {
    const plain = await native.newPage();
    await plain.goto(page.url());
    const field = plain.getByRole("textbox", { name: "Board name" });
    await expect(field).toHaveValue("Renamed board");
    await field.fill("  Renamed board  ");
    const response = plain.waitForResponse((r) => r.url().endsWith("/rename"));
    await field.press("Enter");
    expect((await response).status()).toBe(303);
    await expect(field).toHaveValue("Renamed board");
  } finally {
    await native.close();
  }
}
