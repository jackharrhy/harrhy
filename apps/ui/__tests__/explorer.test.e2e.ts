import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("explores actual props, matching source, and scoped themes", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const preview = page.locator('[data-preview="button"]');
  await page.getByLabel("Variant", { exact: true }).selectOption("danger");
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
  await page
    .getByLabel("Preview theme", { exact: true })
    .selectOption("brutalist");
  assert.equal(new URL(page.url()).searchParams.get("theme"), "brutalist");
  const button = preview.getByRole("button", {
    name: "Delete reference",
    exact: true,
  });
  assert.equal(
    await button.evaluate((node) => getComputedStyle(node).fontFamily),
    '"Times New Roman", Georgia, serif',
  );
  assert.equal(
    await page
      .getByRole("heading", { name: "Button", exact: true })
      .evaluate((node) =>
        getComputedStyle(node).fontFamily.includes("Times New Roman"),
      ),
    false,
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
  await page.getByLabel("Component", { exact: true }).selectOption("field");
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

it("keeps explorer modal, tabs and pending actions keyboard-operable", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.goto("/?component=dialog");
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
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .getByRole("tab", { name: "Activity", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.goto("/?component=action");
  await page
    .locator('[data-preview="action"]')
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  const pending = page.getByRole("button", { name: "Saving…", exact: true });
  assert.equal(await pending.getAttribute("aria-busy"), "true");
  assert.equal(
    await pending.evaluate((node) => node === document.activeElement),
    true,
  );
  await pending.evaluate((node: HTMLButtonElement) => {
    node.click();
    node.click();
  });
  await page
    .getByText("Changes saved in this fixture.", { exact: true })
    .waitFor();
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
  await page.getByLabel("Component", { exact: true }).selectOption("field");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("heading", { name: "Field", exact: true }).waitFor();
});
