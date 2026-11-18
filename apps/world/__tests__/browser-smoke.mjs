import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const url = process.env.HARRHY_WORLD_TEST_URL ?? "http://127.0.0.1:3189/?renderer=webgl";
const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 550 } });
  const other = await browser.newPage({
    viewport: { width: 390, height: 680 },
    hasTouch: true,
    isMobile: true,
  });
  let otherPose;
  other.on("websocket", (socket) => {
    if (!socket.url().endsWith("/room")) return;
    let id;
    socket.on("framereceived", ({ payload }) => {
      const message = JSON.parse(payload.toString());
      if (message.type === "welcome") id = message.id;
      if (message.type === "motion") otherPose = message.players.find((p) => p.id === id);
    });
  });
  let socket;
  let self;
  const samples = [];
  page.on("websocket", (value) => {
    if (!value.url().endsWith("/room")) return;
    socket = value;
    value.on("framereceived", ({ payload }) => {
      const message = JSON.parse(payload.toString());
      if (message.type === "welcome") self = message.id;
      if (message.type === "motion") {
        samples.push(message.players.find((player) => player.id === self));
        if (samples.length > 240) samples.shift();
      }
    });
  });
  for (const tab of [page, other]) {
    tab.on("console", (event) => {
      if (event.type() === "error") errors.push(event.text());
    });
    tab.on("pageerror", (error) => errors.push(error.message));
  }
  await page.goto(url);
  await expect(page.getByRole("status")).toHaveText(/1 player$/, { timeout: 30_000 });
  const canvas = page.locator("canvas");
  await canvas.focus();
  assert.equal(await canvas.evaluate((element) => getComputedStyle(element).outlineStyle), "none");
  const beforeOrbit = await canvas.screenshot();
  await page.mouse.move(430, 260);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(560, 260, { steps: 8 });
  await page.mouse.up({ button: "right" });
  assert.notDeepEqual(await canvas.screenshot(), beforeOrbit);
  assert.equal(await page.evaluate(() => document.pointerLockElement), null);
  await page.reload();
  await expect(page.getByRole("status")).toHaveText(/1 player$/, { timeout: 30_000 });
  await other.goto(url);
  for (const tab of [page, other])
    await expect(tab.getByRole("status")).toHaveText(/2 players$/, { timeout: 30_000 });
  assert(socket && self && samples.at(-1));
  const hall = page.locator("#hall");
  await expect(hall).toHaveAttribute("data-mode", "walk");
  const beforeClick = samples.at(-1).z;
  await page.bringToFront();
  await page.mouse.click(400, 275);
  await expect.poll(() => samples.at(-1)?.z, { timeout: 10_000 }).toBeLessThan(beforeClick - 0.3);
  await other.bringToFront();
  const beforeTap = otherPose.z;
  await other.touchscreen.tap(195, 335);
  await expect.poll(() => otherPose?.z, { timeout: 10_000 }).toBeLessThan(beforeTap - 0.3);
  if (process.env.HARRHY_WORLD_TEST_MOBILE_SCREENSHOT)
    await other.screenshot({ path: process.env.HARRHY_WORLD_TEST_MOBILE_SCREENSHOT });
  await page.bringToFront();
  const before = samples.at(-1).z;
  await expect(page.locator("#mode")).toHaveCount(0);
  await page.mouse.move(400, 250);
  await page.mouse.wheel(0, -800);
  await expect(hall).toHaveAttribute("data-mode", "fps");
  await page.locator("canvas").focus();
  await page.keyboard.down("w");
  try {
    await expect.poll(() => samples.at(-1)?.z, { timeout: 10_000 }).toBeLessThan(before - 0.5);
  } finally {
    await page.keyboard.up("w");
  }
  const hopStart = samples.at(-1).y;
  let rose = false;
  let fell = false;
  const hopSamples = [];
  socket.on("framereceived", ({ payload }) => {
    const message = JSON.parse(payload.toString());
    if (message.type === "motion")
      hopSamples.push(message.players.find((player) => player.id === self)?.y);
  });
  await page.keyboard.down("Space");
  try {
    await expect
      .poll(
        () => {
          for (const y of hopSamples.splice(0)) {
            if (typeof y !== "number") continue;
            if (fell && y > hopStart + 0.25) return true;
            if (y > hopStart + 0.5) rose = true;
            if (rose && y < hopStart + 0.18) fell = true;
          }
          return false;
        },
        { timeout: 8_000 },
      )
      .toBe(true);
  } finally {
    await page.keyboard.up("Space");
  }
  await page.mouse.move(400, 250);
  await page.mouse.wheel(0, 500);
  await expect(hall).toHaveAttribute("data-mode", "walk");
  if (process.env.HARRHY_WORLD_TEST_SCREENSHOT)
    await page.screenshot({ path: process.env.HARRHY_WORLD_TEST_SCREENSHOT });
  await other.goto("about:blank");
  await expect(page.getByRole("status")).toHaveText(/1 player$/);
  await other.goBack();
  await expect(other.getByRole("status")).toHaveText(/2 players$/, { timeout: 30_000 });
  await expect(page.getByRole("status")).toHaveText(/2 players$/);
  await other.close();
  await expect(page.getByRole("status")).toHaveText(/1 player$/);
  assert.deepEqual(errors, []);
  console.log(
    "Desktop click and mobile tap moved authoritative players, FPS toggle and keyboard worked, and rejoin left no duplicate players.",
  );
} catch (error) {
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
