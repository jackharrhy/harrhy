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
