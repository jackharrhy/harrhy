import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [url] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: mobile ? 390 : 1440, height: 850 },
      hasTouch: mobile,
      reducedMotion: mobile ? "reduce" : "no-preference",
    });
    const writes = [],
      errors = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") writes.push(request.method());
    });
    page.on("pageerror", (error) => errors.push(error.name));
    await page.goto(url);
    await page.locator("[data-renderer=pixi-webgl]").waitFor();
    await page.getByRole("status").filter({ hasText: "Saved scan" }).waitFor();
    await page.waitForTimeout(700);
    const map = page.locator("[data-zoom]");
    const pose = () =>
      page.locator("[data-camera]").evaluate((node) => node.style.transform);
    const base = await pose();
    const hit = await page.evaluate(() => {
      for (const tile of document.querySelectorAll("[data-directory]")) {
        const r = tile.getBoundingClientRect();
        for (const [x, y] of [
          [r.x + 3, r.y + 3],
          [r.x + r.width / 2, r.y + 10],
        ]) {
          if (document.elementFromPoint(x, y)?.closest("[data-tile]") === tile)
            return { x, y, id: tile.dataset.tile };
        }
      }
    });
    assert.ok(hit);
    if (mobile) {
      await page.touchscreen.tap(hit.x, hit.y);
      await page.getByRole("button", { name: "Zoom in" }).tap();
    } else await page.mouse.click(hit.x, hit.y, { button: "right" });
    await page.waitForFunction(
      (id) => document.querySelector("[data-zoom]").dataset.zoom === id,
      hit.id,
    );
    await page.waitForTimeout(450);
    assert.notEqual(await pose(), base);
    if (!mobile) {
      const before = await pose();
      const area = await map.boundingBox();
      await page.mouse.move(area.x + 140, area.y + 135);
      await page.mouse.down();
      await page.mouse.move(area.x + 205, area.y + 170, { steps: 8 });
      await page.mouse.up();
      assert.notEqual(await pose(), before);
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.querySelector("[data-zoom]").dataset.zoom === "0",
    );
    await page.waitForTimeout(450);
    assert.equal(await pose(), base);
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    const metrics = await page.evaluate(async () => {
      const canvas = document.querySelector(".world-canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      let draws = 0;
      for (const key of [
        "drawElements",
        "drawArrays",
        "drawElementsInstanced",
      ]) {
        if (!gl[key]) continue;
        const draw = gl[key].bind(gl);
        gl[key] = (...args) => {
          draws++;
          return draw(...args);
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        renderer: info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
        idleDraws: draws,
        tiles: document.querySelectorAll("[data-tile]").length,
      };
    });
    assert.equal(metrics.idleDraws, 0);
    console.log(mobile ? "mobile" : "desktop", metrics);
    await page.close();
  }
} finally {
  await browser.close();
}
