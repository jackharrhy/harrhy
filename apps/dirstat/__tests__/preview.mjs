import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const [url] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
});
let step = "idle";
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 840 },
  });
  page.setDefaultTimeout(22000);
  const requests = [];
  page.on("request", (request) => {
    if (/\/(start|scan\.json)$/.test(request.url()))
      requests.push(request.method());
  });
  const status = page.getByRole("status");
  const start = page.getByRole("button", { name: /^Start scan/ });
  const idle = async () => {
    await status.filter({ hasText: "Ready to scan" }).waitFor();
    assert.equal(await page.locator("[data-row], [data-tile]").count(), 0);
  };
  await page.goto(url);
  await idle();
  assert.deepEqual(requests, []);
  step = "first stream";
  const response = page.waitForResponse(
    (reply) => reply.url() === new URL("/start", url).href,
  );
  await start.click();
  const marker = page.locator("[data-marker]");
  await marker.waitFor();
  const first = await marker.getAttribute("data-marker");
  await page.waitForFunction((initial) => {
    const element = document.querySelector("[data-marker]");
    return element && element.dataset.marker !== initial;
  }, first);
  await status.filter({ hasText: /Scan finished|Scan complete/ }).waitFor();
  const frames = (await (await response).text())
    .trim()
    .split("\n")
    .map(JSON.parse);
  const events = frames.flatMap((frame) => frame.events ?? []);
  step = "paginated drill-down";
  const lookup = new Map(events.map((event) => [event[0], event]));
  const counts = new Map();
  for (const event of events)
    counts.set(event[1], (counts.get(event[1]) ?? 0) + 1);
  const paths = events
    .filter(([id, , , kind]) => kind === "directory" && counts.get(id) > 40)
    .map((event) => {
      const path = [event];
      while (path[0][1]) path.unshift(lookup.get(path[0][1]));
      return path;
    })
    .toSorted((a, b) => a.length - b.length);
  assert.ok(paths[0]);
  for (const [id, parent] of paths[0]) {
    const index = events
      .filter((event) => event[1] === parent)
      .findIndex((event) => event[0] === id);
    for (let i = 0; i < Math.floor(index / 40); i++)
      await page
        .getByRole("button", { name: "Next", exact: true })
        .first()
        .click();
    await page.locator(`[data-row="${id}"]`).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
  }
  await page.getByRole("button", { name: "Next", exact: true }).first().click();
  assert.match(await page.locator(".tree").innerText(), /2 \/ \d+/);
  step = "reload";
  await page.reload();
  await idle();
  assert.deepEqual(requests, ["POST"]);
  // The first run may still be inside the server's admission interval.
  await new Promise((resolve) => setTimeout(resolve, 6500));
  step = "second stream";
  const second = page.waitForResponse(
    (reply) => reply.url() === new URL("/start", url).href,
  );
  await start.click();
  await status.filter({ hasText: /Scan finished|Scan complete/ }).waitFor();
  const body = (await (await second).text()).trim().split("\n").map(JSON.parse);
  assert.notEqual(frames[0].id, body[0].id);
  assert.equal(body.at(-1).done, true);
  console.log(
    "Verified blank load/reload, moving pointer, paginated drill-down, two fresh scans",
  );
} catch (error) {
  console.error(`Live preview verification failed at ${step} (${error.name})`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
