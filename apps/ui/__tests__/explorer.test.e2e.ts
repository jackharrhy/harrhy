import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("explores actual props, matching source, and global themes", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  const preview = page.locator('[data-preview="button"]');
  await page.getByRole("button", { name: "Variant", exact: true }).click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "listbox",
  );
  await page.getByRole("option", { name: "Danger", exact: true }).click();
  await page.locator("pre").filter({ hasText: 'variant="danger"' }).waitFor();
  await page.getByLabel("Label", { exact: true }).fill("Delete reference");
  assert.match(
    await page.locator("pre").innerText(),
    /variant="danger">\{"Delete reference"\}/,
  );
  await preview
    .getByRole("button", { name: "Delete reference", exact: true })
    .click();
  await preview
    .getByRole("status")
    .getByText("Changes saved in this fixture.")
    .waitFor();
  await page.getByLabel("Disabled", { exact: true }).check();
  assert.equal(
    await preview
      .getByRole("button", { name: "Delete reference", exact: true })
      .isDisabled(),
    true,
  );
  assert.match(await page.locator("pre").innerText(), / disabled>/);
  await page.getByLabel("Disabled", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "listbox",
  );
  await page.getByRole("option", { name: "Artbin", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("theme") === "brutalist");
  assert.equal(new URL(page.url()).searchParams.get("theme"), "brutalist");
  const button = preview.getByRole("button", {
    name: "Delete reference",
    exact: true,
  });
  assert.equal(
    await button.evaluate((node) => getComputedStyle(node).fontFamily),
    '"IBM Plex Sans", Arial, sans-serif',
  );
  assert.equal(
    await page
      .getByRole("heading", { name: "Button", exact: true })
      .evaluate((node) =>
        getComputedStyle(node).fontFamily.includes("Fraunces"),
      ),
    true,
  );
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  await page.locator("summary").filter({ hasText: "Component" }).click();
  await page
    .getByRole("link", { name: "Field", exact: true })
    .filter({ visible: true })
    .click();
  const input = page.getByLabel("Collection name", { exact: true });
  await page.getByLabel("Error", { exact: true }).check();
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  assert.equal(
    await input.getAttribute("aria-describedby"),
    "collection-description collection-error",
  );
  await page.getByLabel("Description", { exact: true }).uncheck();
  assert.equal(
    await input.getAttribute("aria-describedby"),
    "collection-error",
  );
  await page.getByLabel("Error", { exact: true }).uncheck();
  assert.equal(await input.getAttribute("aria-invalid"), null);
  assert.equal(await input.getAttribute("aria-describedby"), null);
  assert.deepEqual(errors, []);
});

it("wires Explorer dialog, tabs and async failure controls", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.goto("/?component=dialog");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  const trigger = page.getByRole("button", {
    name: "Rename collection",
    exact: true,
  });
  await trigger.click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByLabel("Collection name", { exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await trigger.evaluate((node) => node === document.activeElement),
    true,
  );
  await page.goto("/?component=tabs");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .getByRole("tab", { name: "Activity", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.goto("/?component=button");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  await page.getByLabel("Async action", { exact: true }).check();
  await page.getByLabel("Simulate failure", { exact: true }).check();
  await page
    .locator('[data-preview="button"]')
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page
    .getByText("Could not save. Turn off simulated failure and try again.", {
      exact: true,
    })
    .waitFor();
  await page.getByLabel("Simulate failure", { exact: true }).uncheck();
  await page
    .locator('[data-preview="button"]')
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page
    .getByText("Changes saved in this fixture.", { exact: true })
    .waitFor();
  assert.match(
    await page
      .getByRole("region", { name: "Code example", exact: true })
      .innerText(),
    /<Button action=\{save\} pendingLabel="Saving…"/,
  );
});

it("filters component navigation with a native GET and without scripts", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.route("**/assets/**", (route) => route.abort());
  await page.goto("/");
  await page
    .getByLabel("Find a component", { exact: true })
    .fill("nothing-matches");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await page.getByText("No components found.", { exact: false }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("q"), "nothing-matches");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await page.locator("summary").filter({ hasText: "Component" }).click();
  await page
    .getByRole("link", { name: "Field", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("heading", { name: "Field", exact: true }).waitFor();
});

it("separates selected, highlighted and disabled options and keeps global theme across destinations", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.goto("/?component=select");
  await page.getByRole("button", { name: "Visibility", exact: true }).click();
  const list = page.getByRole("listbox");
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "listbox",
  );
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  const selected = page.getByRole("option", { name: "Private", exact: true });
  const highlighted = page.getByRole("option", { name: "Shared", exact: true });
  assert.equal(await selected.getAttribute("aria-selected"), "true");
  assert.equal(await highlighted.getAttribute("data-highlighted"), "true");
  assert.notEqual(
    await selected.evaluate((n) => getComputedStyle(n).backgroundColor),
    await highlighted.evaluate((n) => getComputedStyle(n).backgroundColor),
  );
  assert.equal(
    await selected
      .locator("svg")
      .evaluate((n) => getComputedStyle(n).visibility),
    "visible",
  );
  assert.equal(
    await highlighted
      .locator("svg")
      .evaluate((n) => getComputedStyle(n).visibility),
    "hidden",
  );
  assert.equal(
    await highlighted.evaluate((n) => getComputedStyle(n).outlineWidth),
    "2px",
  );
  assert.equal(
    await page
      .getByRole("option", { name: "Public", exact: true })
      .getAttribute("aria-disabled"),
    "true",
  );
  await page.keyboard.press("End");
  assert.equal(await highlighted.getAttribute("data-highlighted"), "true");
  await page.keyboard.press("Escape");
  assert.equal(await list.isVisible(), false);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: "Artbin", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("theme") === "brutalist");
  await page.getByRole("link", { name: "Scenes", exact: true }).click();
  await page.getByRole("link", { name: "Radio", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("theme"), "brutalist");
  assert.equal(
    await page
      .locator("header")
      .first()
      .evaluate((n) =>
        getComputedStyle(n).fontFamily.includes("IBM Plex Sans"),
      ),
    true,
  );
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: "Radio", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("theme") === "tactile");
  await page.reload();
  assert.match(
    await page.getByRole("button", { name: "Theme", exact: true }).innerText(),
    /Radio/,
  );
});

it("keeps the mobile theme picker below its trigger, touch-sized and inside the viewport", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 873 });
    await page.goto("/?view=scenes");
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    const trigger = page.getByRole("button", { name: "Theme", exact: true });
    await trigger.click();
    const list = page.getByRole("listbox");
    await list.waitFor();
    const popup = await page
      .locator("[data-part=select-popover]:visible")
      .boundingBox();
    const button = await trigger.boundingBox();
    assert.ok(popup && button);
    assert.equal(popup.y >= button.y + button.height + 4, true);
    assert.equal(popup.x >= 16 && popup.x + popup.width <= width - 16, true);
    assert.equal(popup.width >= 160, true);
    assert.equal(
      await page
        .getByRole("option", { name: "Artbin", exact: true })
        .evaluate((node) => node.getBoundingClientRect().height >= 40),
      true,
    );
    await page.getByRole("option", { name: "Artbin", exact: true }).click();
    await page.waitForURL(
      (url) => url.searchParams.get("theme") === "brutalist",
    );
    assert.equal(await list.isVisible(), false);
    assert.equal(
      await trigger.evaluate((node) => node === document.activeElement),
      true,
    );
  }
});
