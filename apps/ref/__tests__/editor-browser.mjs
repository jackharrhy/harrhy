import { expect } from "@playwright/test";

// Delay or drop one incoming frame without replacing the authorized socket or
// changing the server's state. Other tabs still receive the real broadcast.
export async function installFrameGate(page, initial = null) {
  await page.addInitScript((firstType) => {
    window.refHoldFrame = firstType;
    window.WebSocket = class extends WebSocket {
      constructor(...args) {
        super(...args);
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

export async function removeImageByKeyboard(page) {
  const picker = page.getByRole("combobox", { name: "Choose card" });
  await page.getByRole("button", { name: "Zoom in" }).focus();
  await page.keyboard.press("Tab");
  await expect(picker).toBeFocused();
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
