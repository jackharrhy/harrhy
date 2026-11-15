import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("exercises extracted parts, official Accordion/Menu and matching Explorer source", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const visit = async (story: string) => {
    await page.goto(`/?component=${story}&theme=brutalist`);
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    return page.locator(`[data-preview="${story}"]`);
  };
  const progress = await visit("progress");
  assert.equal(await progress.locator("progress").getAttribute("value"), "42");
  await page.getByLabel("Unknown total", { exact: true }).check();
  assert.equal(await progress.locator("progress").getAttribute("value"), null);
  assert.match(await page.locator("pre").innerText(), /value=\{null\}/);
  await page.getByLabel("Unknown total", { exact: true }).uncheck();
  await page.getByLabel("Progress (0–100)", { exact: true }).fill("100");
  assert.equal(await progress.locator("progress").getAttribute("value"), "100");

  const accordion = await visit("accordion");
  const storage = accordion.getByRole("button", {
    name: "Storage",
    exact: true,
  });
  const sharing = accordion.getByRole("button", {
    name: "Sharing",
    exact: true,
  });
  assert.equal(await storage.getAttribute("aria-expanded"), "true");
  assert.equal(
    await accordion
      .getByText("Share a link when you are ready.", { exact: true })
      .isVisible(),
    false,
  );
  await storage.focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await sharing.evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Enter");
  assert.equal(await sharing.getAttribute("aria-expanded"), "true");
  assert.equal(await storage.getAttribute("aria-expanded"), "false");
  await page.getByLabel("Allow multiple panels", { exact: true }).check();
  await sharing.click();
  assert.equal(await storage.getAttribute("aria-expanded"), "true");
  assert.equal(await sharing.getAttribute("aria-expanded"), "true");
  assert.match(await page.locator("pre").innerText(), /type="multiple"/);
  await page.getByLabel("Disable Sharing", { exact: true }).check();
  assert.equal(await sharing.isDisabled(), true);
  await storage.focus();
  await page.keyboard.press("End");
  assert.equal(
    await storage.evaluate((node) => node === document.activeElement),
    true,
  );

  const menu = await visit("menu");
  const trigger = menu.getByRole("button", { name: "Actions", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await menu.getByRole("menu").waitFor();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await menu.getByRole("menu").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-preview="menu"] output')?.textContent ===
      "Download",
  );
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Actions",
  );
  await trigger.click();
  await menu.getByRole("menu").waitFor();
  await page.keyboard.press("d");
  await menu
    .locator('[role="menuitem"][data-highlighted="true"]')
    .filter({ hasText: "Download" })
    .waitFor();
  await page.keyboard.press("Escape");
  await menu.getByRole("menu").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Actions",
  );

  const collapsible = await visit("collapsible");
  await collapsible.locator("summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await collapsible.locator("details").getAttribute("open"), "");
  const crumbs = await visit("breadcrumbs");
  assert.equal(await crumbs.locator("ol > li").count(), 3);
  assert.equal(
    await crumbs.locator('[aria-current="page"]').innerText(),
    "Evening radio",
  );
  const nav = await visit("tabs");
  assert.equal(
    await nav
      .getByRole("link", { name: "Browse" })
      .getAttribute("aria-current"),
    "page",
  );
  assert.equal(await nav.getByRole("menu").count(), 0);
  const table = await visit("table");
  assert.equal(
    await table.getByRole("table", { name: "Synthetic uploads" }).count(),
    1,
  );
  assert.equal(await table.locator('th[scope="row"]').count(), 3);
  for (const story of [
    "progress",
    "breadcrumbs",
    "tabs",
    "table",
    "collapsible",
    "accordion",
    "menu",
    "typography",
  ]) {
    await visit(story);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${story} at ${width}px`,
      );
    }
  }
  assert.deepEqual(errors, []);
});

it("keeps native Collapsible operable without browser modules", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.route("**/assets/**", (route) => route.abort());
  await page.goto("/?component=collapsible");
  const disclosure = page.locator("[data-preview=collapsible] details");
  assert.equal(await disclosure.getAttribute("open"), null);
  await disclosure.locator("summary").click();
  assert.equal(await disclosure.getAttribute("open"), "");
  assert.equal(
    await disclosure.getByText("Two images, ready to review.").isVisible(),
    true,
  );
});
