import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";
import { stories } from "../app/public/explorer.tsx";

it("offers the real shared Sluggers theme for every Explorer component without private assets", async (t) => {
  const app = createApp(undefined, { sluggersPrivateFonts: false });
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  const errors: string[] = [];
  const privateRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/sluggers/"))
      privateRequests.push(request.url());
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const story of stories) {
      await page.goto(`/?component=${story.id}&theme=sluggers`);
      await page.waitForFunction(
        () => document.documentElement.dataset.uiReady === "true",
      );
      const preview = page.locator(`[data-preview="${story.id}"]`);
      assert.equal(await preview.getAttribute("data-theme"), "sluggers");
      assert.equal(
        await preview.evaluate((node) => getComputedStyle(node).colorScheme),
        "dark",
      );
      assert.match(
        await page.locator("[data-source] pre").innerText(),
        /themeStyles\(sluggersTheme\)/,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Theme", exact: true })
          .innerText(),
        "Scorebook",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${story.id} ${width}`,
      );
      if (story.id === "table") {
        const th = preview.locator("th").first();
        const td = preview.locator("td").first();
        assert.deepEqual(
          await th.evaluate((node) => [
            getComputedStyle(node).fontSize,
            getComputedStyle(node).padding,
          ]),
          ["12px", "10px 12px"],
        );
        assert.equal(
          await td.evaluate((node) => getComputedStyle(node).fontSize),
          "14px",
        );
      }
    }
  }
  assert.deepEqual(privateRequests, []);
  assert.deepEqual(errors, []);
});

it("keeps Sluggers keyboard focus and official popup semantics", async (t) => {
  const app = createApp(undefined, { sluggersPrivateFonts: false });
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.goto("/?component=menu&theme=sluggers");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  const preview = page.locator('[data-preview="menu"]');
  const trigger = preview.getByRole("button", { name: "Actions", exact: true });
  await trigger.focus();
  assert.equal(
    await trigger.evaluate((node) => getComputedStyle(node).outlineWidth),
    "2px",
  );
  await page.keyboard.press("Enter");
  await preview.getByRole("menu").waitFor();
  await page.keyboard.press("Escape");
  await preview.getByRole("menu").waitFor({ state: "hidden" });
  await page.waitForFunction(
    (id) => document.activeElement?.id === id,
    await trigger.getAttribute("id"),
  );
  const select = preview.getByLabel("File order", { exact: true });
  await select.focus();
  await page.keyboard.press("Enter");
  await preview.getByRole("listbox").waitFor();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await preview.getByRole("listbox").waitFor({ state: "hidden" });
  await page.waitForFunction(
    (id) => document.activeElement?.id === id,
    await select.getAttribute("id"),
  );
});

it("loads opt-in font declarations before a hydrated Clean to Sluggers selection without downloading them on Clean or Radio", async (t) => {
  const app = createApp(undefined, { sluggersPrivateFonts: true });
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  let fontRequests = 0;
  // Use the already licensed package font as a synthetic family; no private binaries in CI.
  await page.route("**/assets/ui/sluggers/fonts.css", (route) =>
    route.fulfill({
      contentType: "text/css",
      body: '@font-face {font-family:SluggersCezanne;src:url("/assets/hui/fonts/ibm-plex-sans-latin.woff2?sluggers-font-fixture");font-weight:100 900;font-display:swap}',
    }),
  );
  page.on("request", (request) => {
    if (request.url().includes("sluggers-font-fixture")) fontRequests++;
  });
  for (const theme of ["clean", "tactile"]) {
    await page.goto(`/?component=button&theme=${theme}`);
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    await page.evaluate(() => document.fonts.ready);
    assert.equal(fontRequests, 0);
  }
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: "Scorebook", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-preview="button"]')
        ?.getAttribute("data-theme") === "sluggers",
  );
  await page.evaluate(() => document.fonts.ready);
  assert.equal(fontRequests > 0, true);
  assert.match(page.url(), /theme=sluggers/);
  assert.match(
    await page
      .locator('[data-preview="button"]')
      .evaluate((node) => getComputedStyle(node).fontFamily),
    /SluggersCezanne/,
  );
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: "Basic", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-preview="button"]')
        ?.getAttribute("data-theme") === "clean",
  );
  assert.equal(
    await page
      .locator('[data-preview="button"]')
      .evaluate((node) =>
        getComputedStyle(node).fontFamily.includes("Sluggers"),
      ),
    false,
  );
});
