import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("hydrates patterns, manages keyboard focus and pending actions, and submits GET", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Workbench theme").selectOption("tactile");
  await page.locator('[data-theme="tactile"]').waitFor();
  await page.getByRole("button", { name: "Allow access", exact: true }).click();
  await page
    .getByText("Access allowed in this fixture.", { exact: false })
    .waitFor();
  await page
    .getByLabel("Board title", { exact: true })
    .fill("Print references");
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  await page.getByText("Board created in memory.", { exact: false }).waitFor();

  await page
    .getByRole("button", { name: "Edit room name", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Edit room name", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Room name", { exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .getByRole("button", { name: "Save room name", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .getByRole("button", { name: "Cancel", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Edit room name", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );

  await page.getByRole("tab", { name: "Radio room", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const archive = page.getByRole("tab", { name: "Artbin export", exact: true });
  assert.equal(await archive.getAttribute("aria-selected"), "true");
  await page
    .getByRole("button", { name: "Export fixture", exact: true })
    .click();
  const pending = page.getByRole("button", {
    name: "Exporting fixture…",
    exact: true,
  });
  assert.equal(await pending.getAttribute("aria-busy"), "true");
  await pending.evaluate((node: HTMLButtonElement) => {
    node.click();
    node.click();
  });
  await page
    .getByText("Fixture export 1 complete.", { exact: false })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Export fixture", exact: true })
      .getAttribute("aria-busy"),
    null,
  );

  const source = page.getByLabel("Source URL", { exact: true });
  assert.equal(await source.getAttribute("aria-invalid"), "true");
  assert.equal(
    await source.getAttribute("aria-describedby"),
    "invalid-url-description invalid-url-error",
  );
  await page
    .getByRole("button", { name: "Cycle field validation", exact: true })
    .click();
  await page
    .getByText("Address format accepted in this fixture.", { exact: true })
    .waitFor();
  assert.equal(await source.getAttribute("aria-invalid"), null);
  assert.equal(
    await source.getAttribute("aria-describedby"),
    "invalid-url-description",
  );
  assert.equal(await page.locator("#invalid-url-error").count(), 0);
  await page
    .getByRole("button", { name: "Cycle field validation", exact: true })
    .click();
  assert.equal(await source.getAttribute("aria-describedby"), null);
  assert.equal(await page.locator("#invalid-url-description").count(), 0);
  await page
    .getByRole("button", { name: "Cycle field validation", exact: true })
    .click();
  assert.equal(await source.getAttribute("aria-invalid"), "true");

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Copy field example", exact: true })
    .click();
  await page.getByText("Copied code.", { exact: true }).waitFor();
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /<Field id="board-title"/,
  );

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  await page.getByLabel("Find a component", { exact: true }).fill("Button");
  await page
    .getByRole("button", { name: "Filter components", exact: true })
    .click();
  await page.waitForURL("**/?theme=tactile&q=Button");
  await page.getByText("Results for “Button”", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});
it("supports the native GET form without JavaScript", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.context().setOffline(false);
  // Blocking scripts proves the document form does not rely on hydration.
  await page.route("**/assets/**", (route) => route.abort());
  await page.goto("/");
  await page
    .getByLabel("Find a component", { exact: true })
    .fill("nothing-matches");
  await page
    .getByRole("button", { name: "Filter components", exact: true })
    .click();
  await page.getByText("No matching components.", { exact: false }).waitFor();
});

it("keeps Artbin reference geometry and visible focus scoped at desktop and mobile", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.goto("/?theme=brutalist");
  const specimen = page.locator('[data-comparison="brutalist"]');
  const button = specimen.getByRole("button", { name: "Save collection" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.deepEqual(
      await button.evaluate((node) => {
        const style = getComputedStyle(node);
        return [
          style.fontFamily,
          style.fontSize,
          style.backgroundColor,
          style.color,
          style.borderWidth,
          style.borderRadius,
          style.padding,
          style.boxShadow,
        ];
      }),
      [
        '"Times New Roman", Georgia, serif',
        "14px",
        "rgb(17, 17, 17)",
        "rgb(255, 255, 255)",
        "1px",
        "0px",
        "6px 12px",
        "none",
      ],
    );
    assert.equal(
      await specimen
        .locator("input")
        .evaluate((node) => getComputedStyle(node).borderColor),
      "rgb(204, 204, 204)",
    );
    await button.focus();
    assert.equal(
      await button.evaluate((node) => getComputedStyle(node).outlineWidth),
      "2px",
    );
    assert.equal(
      await specimen
        .getByRole("button", { name: "Export", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  assert.equal(
    await page
      .locator('[data-comparison="clean"] button')
      .first()
      .evaluate((node) =>
        getComputedStyle(node).fontFamily.includes("Times New Roman"),
      ),
    false,
  );
});
