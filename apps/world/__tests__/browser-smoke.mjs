import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const url = process.env.HARRHY_WORLD_TEST_URL ?? "http://127.0.0.1:3189/?renderer=webgl";
const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 550 } });
  const other = await browser.newPage({ viewport: { width: 800, height: 550 } });
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
  await other.goto(url);
  for (const tab of [page, other])
    await expect(tab.getByRole("status")).toHaveText(/2 players$/, { timeout: 30_000 });
  assert(socket && self && samples.at(-1));
  const before = samples.at(-1).z;
  await page.bringToFront();
  await page.locator("canvas").focus();
  await page.keyboard.down("w");
  try {
    await expect.poll(() => samples.at(-1)?.z, { timeout: 10_000 }).toBeLessThan(before - 0.5);
  } finally {
    await page.keyboard.up("w");
  }
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
    "Two clients joined, keyboard motion reached authority, navigation cleaned up, and rejoin left no duplicate players.",
  );
} catch (error) {
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
