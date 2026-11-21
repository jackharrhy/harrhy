import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { startDoodleGallery } from "../fixtures/doodle-gallery.mjs";

const { origin, poolFile, close } = await startDoodleGallery();
let browser;
try {
  browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({
      viewport: { width: 1000, height: 900 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Preview Silk braid", exact: true })
    .waitFor();
  assert.equal(await page.locator(".concept").count(), 10);
  assert.equal(await page.locator(".mock-form input").count(), 0);
  for (const name of [
    "Silk folds",
    "Silk",
    "Silk sheen",
    "Silk veil",
    "Caustics",
    "Caustic glass",
    "Caustic ripples",
    "Silk braid",
    "Caustic tide",
    "Deep water",
  ]) {
    await page
      .getByRole("button", { name: "Preview " + name, exact: true })
      .click();
    assert((await page.locator("#renderer").innerText()).includes("WebGL"));
  }
  await page.getByRole("button", { name: "Preview Silk", exact: true }).click();
  await page.getByLabel("Motion", { exact: true }).uncheck();
  const neutralFrame = await page.locator(".motion-canvas").screenshot();
  await page.getByLabel("Color strength", { exact: true }).fill("1.65");
  assert.notDeepEqual(
    neutralFrame,
    await page.locator(".motion-canvas").screenshot(),
  );
  await page.getByLabel("Saturation", { exact: true }).fill("1.8");
  await page
    .getByRole("button", { name: "Preview Silk braid", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Color strength", { exact: true }).inputValue(),
    "0.8",
  );
  await page.getByRole("button", { name: "Preview Silk", exact: true }).click();
  assert.equal(
    await page.getByLabel("Color strength", { exact: true }).inputValue(),
    "1.65",
  );
  await page.getByLabel("Silk", { exact: true }).check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Saved", { exact: true }).waitFor();
  assert.deepEqual(
    JSON.parse(await readFile(poolFile, "utf8")).enabled,
    ["silk", "silk-braid"],
  );
  assert.equal(
    JSON.parse(await readFile(poolFile, "utf8")).settings.silk
      .color,
    1.65,
  );
  await page.reload();
  await page.getByRole("button", { name: "Preview Silk", exact: true }).click();
  assert.equal(
    await page.getByLabel("Saturation", { exact: true }).inputValue(),
    "1.8",
  );
  await page.getByLabel("Motion", { exact: true }).uncheck();
  await page.locator(".stage").scrollIntoViewIfNeeded();
  const still = await page.locator(".motion-canvas").screenshot();
  await page.waitForTimeout(250);
  assert.deepEqual(still, await page.locator(".motion-canvas").screenshot());
  await page
    .locator(".motion-canvas")
    .evaluate((canvas) =>
      canvas
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        .loseContext(),
    );
  await page.waitForFunction(() => !document.querySelector(".motion-canvas"));
  assert.equal(await page.locator("#art svg").getAttribute("hidden"), null);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS real WebGL gallery: ten shaders, private pool persistence, paused frame, context-loss fallback and mobile.",
  );
} finally {
  await browser?.close();
  await close();
}
