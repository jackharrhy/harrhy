import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { createAtlas } from "../app/router.tsx";
const { chromium } = await import(process.env.HARRHY_ATLAS_PLAYWRIGHT ?? "@playwright/test");
const browser = await chromium.launch({ headless: true });
const root = await mkdtemp(path.join(tmpdir(), "atlas-tweet-browser-"));
let app, server;
try {
  await mkdir(path.join(root, "alpha", "images"), { recursive: true });
  await mkdir(path.join(root, "code"));
  const generator = await browser.newPage();
  const png = await generator.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 600;
    const x = c.getContext("2d");
    x.fillStyle = "#165d44";
    x.fillRect(0, 0, 900, 600);
    x.fillStyle = "#fff";
    x.font = "40px sans-serif";
    x.fillText("Synthetic poolroom", 50, 100);
    return c.toDataURL("image/png").split(",")[1];
  });
  await generator.close();
  for (const name of ["one", "two", "three"])
    await writeFile(path.join(root, "alpha", "images", name + ".png"), Buffer.from(png, "base64"));
  await writeFile(
    path.join(root, "alpha", "tweet.md"),
    "---\ntitle: Snapshot example\npath: /tweet/\n---\n[Original public post](https://x.com/example/status/123)\n\nReadable transcript fallback.\n\n[[widget:tweet]]",
  );
  await writeFile(
    path.join(root, "code", "tweet-xeet.tsx"),
    await readFile(new URL("../examples/tweet-xeet.tsx", import.meta.url)),
  );
  await writeFile(
    path.join(root, "atlas.json"),
    JSON.stringify({ spaces: [{ id: "alpha", name: "Alpha", directory: "alpha" }] }),
  );
  const data = {
    url: "https://x.com/example/status/123",
    author: { name: "Example author", handle: "example" },
    text: "A public snapshot <script>alert(1)</script> & an exact quote.",
    publishedAt: "2026-11-07T05:17:26.000Z",
    capturedAt: "2026-11-16T05:00:00.000Z",
    provenance: "Synthetic fixture, no external fetch.",
    media: ["one", "two", "three"].map((name) => ({
      src: `/_atlas/images/alpha/${name}.png`,
      alt: `Synthetic ${name}`,
    })),
  };
  const manifest = path.join(root, "widgets.json");
  await writeFile(
    manifest,
    JSON.stringify({
      trust: "tailnet-owner-temporary",
      root: path.join(root, "code"),
      widgets: [
        {
          id: "tweet",
          space: "alpha",
          page: "/tweet/",
          module: "tweet-xeet.tsx",
          capabilities: ["xeet"],
          data,
        },
      ],
    }),
  );
  app = await createAtlas(root, path.join(root, "atlas.json"), manifest);
  server = createServer(async (req, res) => {
    const response = await app.router.fetch(
      new Request(`http://${req.headers.host}${req.url}`, { headers: req.headers }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const wasmResponse = await fetch(`${base}/xeet/50dd9b5a450e394b.wasm`);
  assert.equal(wasmResponse.status, 200);
  assert.equal(wasmResponse.headers.get("content-type"), "application/wasm");
  const wasmBytes = new Uint8Array(await wasmResponse.arrayBuffer());
  assert.deepEqual(Array.from(wasmBytes.slice(0, 8)), [0,97,115,109,1,0,0,0]);
  const exports = WebAssembly.Module.exports(await WebAssembly.compile(wasmBytes)).map(item => item.name);
  assert.ok(exports.includes("call"));
  assert.ok(exports.includes("memory"));
  const workerResponse = await fetch(`${base}/_atlas/xeet-worker.js`);
  const workerCsp = workerResponse.headers.get("content-security-policy");
  assert.match(workerCsp, /script-src 'wasm-unsafe-eval'/);
  assert.doesNotMatch(workerCsp, /'unsafe-eval'/);
  const ordinaryResponse = await fetch(`${base}/spaces/alpha/`);
  assert.doesNotMatch(ordinaryResponse.headers.get("content-security-policy"), /worker-src|wasm-unsafe-eval|unsafe-eval/);
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled });
    const blocked = [],
      errors = [];
    await context.route("**/*", (route) => {
      if (route.request().method() !== "GET" || new URL(route.request().url()).origin !== base) {
        blocked.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.log("PAGEERROR", error.message);
    });
    page.on("console", (msg) => console.log("BROWSER", msg.type(), msg.text()));
    page.on("response", async (response) => {
      if (response.url().includes("xeet"))
        console.log("ASSET", response.status(), response.url(), response.headers()["content-type"]);
    });
    for (const theme of ["clean", "tactile", "brutalist"])
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        const documentResponse = await page.goto(`${base}/spaces/alpha/tweet/?theme=${theme}`);
        assert.match(documentResponse.headers()["content-security-policy"], /worker-src 'self'/);
        assert.doesNotMatch(documentResponse.headers()["content-security-policy"], /wasm-unsafe-eval|unsafe-eval/);
        assert.ok(await page.getByText("Readable transcript fallback.").isVisible());
        assert.equal(
          await page.getByRole("link", { name: "Original public post" }).getAttribute("href"),
          data.url,
        );
        if (javaScriptEnabled) {
          const card = page.locator("section[aria-label^='Xeet rendering']");
          await card.waitFor();
          await page
            .waitForFunction(
              () =>
                document
                  .querySelector("[data-xeet-render-count]")
                  ?.getAttribute("data-xeet-render-count") === "1",
              null,
              { timeout: 15000 },
            )
            .catch(async (error) => {
              console.log(await card.textContent());
              throw error;
            });
          const before = await card
            .locator("canvas")
            .evaluate((c) => ({ width: c.width, height: c.height, png: c.toDataURL() }));
          assert.equal(before.width, 600);
          assert.ok(before.height > 100);
          await card.getByRole("button", { name: "Render dark" }).click();
          await page.waitForFunction(
            () =>
              document
                .querySelector("[data-xeet-render-count]")
                ?.getAttribute("data-xeet-render-count") === "2",
          );
          const after = await card.locator("canvas").evaluate((c) => c.toDataURL());
          assert.notEqual(before.png, after);
          await card.getByRole("button", { name: "Render timeline" }).click();
          await page.waitForFunction(
            () =>
              document
                .querySelector("[data-xeet-render-count]")
                ?.getAttribute("data-xeet-render-count") === "3",
          );
          const report = JSON.parse(await card.locator("[data-xeet-report]").textContent());
          assert.equal(report.text.visible, data.text);
          assert.equal(report.size.width, 600);
          await card.getByText("Verified transcript and provenance", { exact: true }).click();
          assert.equal(await card.locator("p").nth(2).textContent(), data.text);
          const box = await card.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width);
          await page.screenshot({ path: `/tmp/atlas-xeet-${theme}-${width}.png` });
        } else assert.equal(await page.locator("canvas").count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
    assert.deepEqual(blocked, []);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "PASS actual Xeet WASM PNG decode, genuine theme/surface rerenders, three local photos, all themes/mobile/no-JS, no external fetch",
  );
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  app?.close();
  await rm(root, { recursive: true, force: true });
}
