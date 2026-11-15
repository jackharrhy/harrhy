import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

// Synthetic images only: this proof never opens a Ref board or private store.
const bundle = await build({
  entryPoints: [
    new URL("../app/assets/board-images.ts", import.meta.url).pathname,
  ],
  bundle: true,
  format: "esm",
  write: false,
});
const server = createServer((request, response) => {
  if (request.url === "/images.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end(bundle.outputFiles[0].text);
  } else if (request.url === "/assets/thumb-worker.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end("");
  } else {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(
      '<body style="margin:0;background:white"><img id="image" style="width:200px;height:200px" alt="Synthetic green square"><script type="module">import { boardImages } from "/images.js"; window.images=boardImages;</script>',
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const output = process.env.REF_LOD_PROOF_DIR;
if (output) await mkdir(output, { recursive: true, mode: 0o700 });
try {
  const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Hold actual network responses; decoding and painting remain real browser work.
  let release;
  let request = Promise.withResolvers();
  await page.route("**/media/**", async (route) => {
    const result = new Promise((resolve) => {
      release = resolve;
    });
    request.resolve();
    const status = await result;
    await route.fulfill({
      status,
      contentType: "image/svg+xml",
      body:
        status === 200
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048"><path fill="#008000" d="M0 0h2048v2048H0z"/></svg>'
          : "Unavailable",
    });
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.images);
  await page.evaluate(async () => {
    const cache = await caches.open("ref-board-images-v1");
    await cache.put(
      "/media/test/green",
      new Response(
        new Blob(
          [
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#008000" d="M0 0h32v32H0z"/></svg>',
          ],
          { type: "image/svg+xml" },
        ),
      ),
    );
    window.images.load(document.querySelector("#image"), "/media/test/green");
  });
  await page.waitForFunction(
    () => document.querySelector("#image").naturalWidth === 32,
  );
  const preview = await page.locator("#image").getAttribute("src");
  async function painted(name) {
    // A screenshot captures the composited frame, unlike checking load events.
    const screenshot = await page.screenshot(
      output ? { path: `${output}/${name}.png` } : {},
    );
    const pixel = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return [...context.getImageData(100, 100, 1, 1).data];
    }, screenshot.toString("base64"));
    assert.deepEqual(pixel, [0, 128, 0, 255], name);
  }
  await painted("01-preview");
  await page.evaluate(() =>
    window.images.setDetail(document.querySelector("#image"), true),
  );
  await request.promise;
  for (let frame = 0; frame < 4; frame++) await painted(`02-delayed-${frame}`);
  assert.equal(await page.locator("#image").getAttribute("src"), preview);
  // A reversal cancels the candidate, even if its network response arrives later.
  await page.evaluate(() =>
    window.images.setDetail(document.querySelector("#image"), false),
  );
  release(200);
  await painted("03-reversed");
  assert.equal(await page.locator("#image").getAttribute("src"), preview);
  request = Promise.withResolvers();
  await page.evaluate(() =>
    window.images.setDetail(document.querySelector("#image"), true),
  );
  await request.promise;
  release(503);
  await page.waitForFunction(
    () => !window.images.pending.has(document.querySelector("#image")),
  );
  await painted("04-error-keeps-preview");
  assert.equal(await page.locator("#image").getAttribute("src"), preview);
  request = Promise.withResolvers();
  await page.evaluate(() =>
    window.images.setDetail(document.querySelector("#image"), true),
  );
  await request.promise;
  await painted("05-retry-pending");
  release(200);
  await page.waitForFunction(
    () => document.querySelector("#image").naturalWidth === 2048,
  );
  await painted("06-decoded-original");
  await page.evaluate(() =>
    window.images.setDetail(document.querySelector("#image"), false),
  );
  await page.waitForFunction(
    () => document.querySelector("#image").naturalWidth === 32,
  );
  await painted("07-preview-again");
  assert.deepEqual(errors, []);
  console.log(
    "LOD handoff: real Chromium delayed response, reversal, error, retry and decoded handoff; all composited frames retain green synthetic image.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
