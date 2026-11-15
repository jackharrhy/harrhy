import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("integrates shared code views, safe live source, copy and prepared diff states", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?component=code");
  const sample =
    '<script>throw new Error("must stay text")</script>\n\t<Button>Save</Button>';
  await page.getByLabel("Source", { exact: true }).fill(sample);
  const region = page.getByRole("region", {
    name: "Collection action",
    exact: true,
  });
  assert.equal(await region.textContent(), sample);
  assert.equal(await region.locator("script, button").count(), 0);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  await page.getByText("Copied.", { exact: true }).waitFor();
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /<CodeBlock/,
  );
  await page.getByLabel("Long line", { exact: true }).check();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal(
      await region.evaluate((node) => node.scrollWidth > node.clientWidth),
      true,
    );
    await region.focus();
    assert.equal(
      await region.evaluate((node) => node === document.activeElement),
      true,
    );
  }
  await page.locator("summary").filter({ hasText: "Component" }).click();
  await page
    .getByRole("link", { name: "CodeDiff", exact: true })
    .filter({ visible: true })
    .click();
  const diff = page.getByRole("region", {
    name: "Action label revision",
    exact: true,
  });
  await diff.locator('[data-change="add"]').waitFor();
  assert.equal(await diff.locator('[data-change="add"]').count(), 1);
  assert.equal(await diff.locator('[data-change="remove"]').count(), 1);
  assert.match((await diff.textContent()) ?? "", /Removed old line 3/);
  await page.getByLabel("Line numbers", { exact: true }).uncheck();
  assert.equal((await diff.textContent())?.includes("old line 3"), false);
  const source =
    (await page
      .getByRole("region", { name: "Code example", exact: true })
      .textContent()) ?? "";
  assert.equal(
    source.indexOf("const lines") < source.indexOf("<section"),
    true,
  );
  await page.getByLabel("No changes", { exact: true }).check();
  await page
    .getByText("No changes in this fixture.", { exact: true })
    .waitFor();
  assert.equal(await diff.locator("[data-change]").count(), 0);
  assert.deepEqual(errors, []);
});
