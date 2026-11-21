import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";
const { chromium } = await import(process.env.HARRHY_ATLAS_PLAYWRIGHT ?? "@playwright/test");
const browser = await chromium.launch({ headless: true });
const root = await mkdtemp(path.join(tmpdir(), "atlas-image-browser-"));
let server, app;
try {
  const generator = await browser.newPage();
  const rasters = await generator.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ddd";
    ctx.fillRect(0, 0, 1600, 900);
    ctx.fillStyle = "#222";
    ctx.font = "48px sans-serif";
    ctx.fillText("Synthetic Atlas image", 80, 120);
    return ["png", "jpeg", "webp"].map((type) => ({
      extension: type,
      data: canvas.toDataURL(`image/${type}`).split(",")[1],
    }));
  });
  await generator.close();
  await mkdir(path.join(root, "alpha", "images"), { recursive: true });
  for (const raster of rasters)
    await writeFile(
      path.join(root, "alpha", "images", `example.${raster.extension}`),
      Buffer.from(raster.data, "base64"),
    );
  await writeFile(
    path.join(root, "alpha", "images", "example.gif"),
    Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
  );
  await writeFile(
    path.join(root, "alpha", "guide.md"),
    '---\ntitle: Illustrated guide\npath: /guide/\n---\nBefore.\n\n![WebP example](/images/example.webp "Useful screenshot")\n\n![PNG example](../images/example.png)\n\n![JPEG example](/images/example.jpeg)\n\n![GIF example](/images/example.gif)\n\n![Remote forbidden](https://tracker.invalid/private.png)\n\n![SVG forbidden](/images/active.svg)\n\nAfter.',
  );
  await writeFile(
    path.join(root, "atlas.json"),
    JSON.stringify({ spaces: [{ id: "alpha", name: "Alpha", directory: "alpha" }] }),
  );
  app = await createAtlas(root, path.join(root, "atlas.json"));
  server = createServer(async (req, res) => {
    const response = await app.router.fetch(
      new Request(`http://${req.headers.host}${req.url}`, { headers: req.headers }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled });
    const unexpected = [];
    const errors = [];
    await context.route("**/*", (route) => {
      const request = route.request();
      if (request.method() !== "GET" || new URL(request.url()).origin !== base) {
        unexpected.push(request.url());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    for (const theme of ["clean", "tactile", "brutalist"])
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/spaces/alpha/guide/?theme=${theme}`);
        assert.equal(await page.locator("[data-atlas-markdown] img").count(), 4);
        for (const image of await page.locator("[data-atlas-markdown] img").all()) {
          await image.scrollIntoViewIfNeeded();
          await image.evaluate((node) =>
            node.complete && node.naturalWidth > 0
              ? Promise.resolve()
              : new Promise((resolve, reject) => {
                  node.addEventListener("load", resolve, { once: true });
                  node.addEventListener("error", () => reject(Error("raster did not load")), {
                    once: true,
                  });
                }),
          );
          assert.ok(await image.evaluate((node) => node.naturalWidth > 0));
          const box = await image.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width);
          assert.match(await image.getAttribute("src"), /^\/_atlas\/images\/alpha\//);
          assert.ok(await image.getAttribute("alt"));
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.evaluate(() => scrollTo(0, 0));
        if (javaScriptEnabled)
          await page.screenshot({ path: `/tmp/atlas-image-${theme}-${width}.png` });
      }
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "PASS real Markdown PNG/JPEG/WebP/GIF naturalWidth/alt/scoped URLs/no remote requests/responsive3themes/no-JS",
  );
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  app?.close();
  await rm(root, { recursive: true, force: true });
}
