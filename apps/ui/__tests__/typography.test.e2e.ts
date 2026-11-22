import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("loads Artbin's three font roles on demand without changing Clean/Radio fonts", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  const fonts: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(".woff2"))
      fonts.push(request.url());
  });
  await page.goto("/explorer/code");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(fonts, []);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: "Dial", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("theme") === "dial");
  assert.deepEqual(fonts, []);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: "Newspaper", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("theme") === "newspaper");
  await page.evaluate(() => document.fonts.ready);
  assert.equal(fonts.length, 3);
  assert.equal(
    fonts.every((url) => new URL(url).origin === new URL(page.url()).origin),
    true,
  );
  const roles = await page.evaluate(() => {
    const [heading, body, control, code, detail] = [
      "main h1",
      "main p",
      "#code-language",
      '[aria-label="Collection action"]',
      '[data-preview="code"] figcaption > span:last-child',
    ].map((selector) => getComputedStyle(document.querySelector(selector)!));
    return {
      heading: heading!.fontFamily,
      axes: heading!.fontVariationSettings,
      body: body!.fontFamily,
      control: control!.fontFamily,
      code: code!.fontFamily,
      detail: detail!.fontFamily,
      loaded: ["Fraunces", "IBM Plex Sans", "IBM Plex Mono"].every((font) =>
        document.fonts.check(`16px "${font}"`),
      ),
    };
  });
  assert.match(roles.heading, /Fraunces/);
  assert.match(roles.axes, /"SOFT" 30/);
  assert.match(roles.axes, /"WONK" 1/);
  assert.match(roles.body, /IBM Plex Sans/);
  assert.match(roles.control, /IBM Plex Sans/);
  assert.match(roles.code, /IBM Plex Mono/);
  assert.match(roles.detail, /IBM Plex Mono/);
  assert.equal(roles.loaded, true);
});
