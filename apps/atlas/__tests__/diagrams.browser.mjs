import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";
const { chromium } = await import(process.env.HARRHY_ATLAS_PLAYWRIGHT ?? "@playwright/test");
const browser = await chromium.launch({ headless: true });
const root = await mkdtemp(path.join(tmpdir(), "atlas-diagram-browser-"));
let server, app;
try {
  await mkdir(path.join(root, "alpha"));
  await writeFile(
    path.join(root, "alpha", "guide.md"),
    "---\ntitle: Authoring flow\npath: /guide/\n---\nValidate before publishing; failed edits retain the last good generation.\n\n```mermaid\nflowchart TD\n A[Write Markdown] --> B{Valid generation?}\n B -->|Yes| C[Publish together]\n B -->|No| D[Keep last good pages]\n D --> A\n```\n\nReaders see one coherent generation.",
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
    const unexpected = [],
      errors = [];
    await context.route("**/*", (route) => {
      if (route.request().method() !== "GET" || new URL(route.request().url()).origin !== base) {
        unexpected.push(route.request().url());
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
        const svg = page.locator("[data-atlas-diagram] > svg");
        assert.equal(await svg.count(), 1);
        assert.match(await svg.textContent(), /Valid generation/);
        const box = await svg.boundingBox();
        assert.ok(box.width > 100 && box.height > 100 && box.x >= 0 && box.x + box.width <= width);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.locator("[data-atlas-diagram] summary").click();
        assert.ok(await page.locator("[data-atlas-diagram] pre").isVisible());
        if (javaScriptEnabled)
          await page.screenshot({
            path: `/tmp/atlas-diagram-${theme}-${width}.png`,
            fullPage: true,
          });
      }
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("PASS static Mermaid SVG, source disclosure, theme/responsive/no-JS, GET-only");
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  app?.close();
  await rm(root, { recursive: true, force: true });
}
