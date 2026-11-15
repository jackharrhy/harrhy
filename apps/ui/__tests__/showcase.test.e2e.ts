import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("keeps Artbin reference geometry and visible focus scoped at desktop and mobile", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.goto("/?view=scenes&scene=themes&theme=brutalist");
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
      "rgb(136, 136, 136)",
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

it("exercises local consent and board composition without persistence", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.goto("/?view=scenes");
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await page
    .getByText("Access denied. Nothing shared.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Reset consent", exact: true })
    .click();
  await page.getByRole("button", { name: "Allow access", exact: true }).click();
  await page
    .getByText("Access allowed locally. No permissions changed.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByLabel("Board title", { exact: true })
    .fill("Print references");
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  await page
    .getByText("“Print references” created in memory.", { exact: true })
    .waitFor();
  await page.reload();
  await page.getByText("No boards yet.", { exact: true }).waitFor();
});
