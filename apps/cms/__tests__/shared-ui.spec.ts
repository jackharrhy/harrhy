import { test, expect } from "@playwright/test";
import { credentials } from "./fixture.ts";

const cleanCanvas = "rgb(246, 247, 248)";

test("Clean is scoped to admin and visual tools, not website content", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("Content Security Policy")
    )
      errors.push(message.text());
  });
  await page.goto("http://operator.localhost:4352/login");
  expect(
    await page
      .locator("html")
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--hui-canvas").trim(),
      ),
  ).toBe("#f6f7f8");
  await page.getByLabel("Email address").fill("operator@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("operator-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sites", exact: true }),
  ).toBeVisible();
  const capture = process.env.HARRHY_CMS_SCREENSHOT_DIR;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (capture)
      await page.screenshot({
        path: `${capture}/operator-${width}.png`,
        fullPage: true,
      });
  }

  const origin = "http://andrew.localhost:4352";
  await page.goto(origin + "/tea/login");
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/tea/admin/homepage");
  await expect(page.locator("#workspace")).not.toHaveAttribute("inert", "");
  expect(
    await page
      .locator("html")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(cleanCanvas);
  const previewBody = page
    .frameLocator(".preview-panel iframe")
    .locator("body");
  await expect(previewBody).toContainText("Sidebar fixture");
  await expect(previewBody).toHaveCSS(
    "font-family",
    "ui-sans-serif, system-ui, sans-serif",
  );
  expect(
    await previewBody.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--hui-canvas").trim(),
    ),
  ).toBe("");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390) {
      await page.getByRole("button", { name: "Close navigation" }).click();
      await expect(page.locator("#cms-navigation")).toBeHidden();
    }
    if (capture)
      await page.screenshot({
        path: `${capture}/editor-${width}.png`,
        fullPage: true,
      });
  }

  const visitor = await browser.newPage();
  await visitor.goto(origin);
  const publicCanvas = await visitor
    .locator("body")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(
    await visitor
      .locator("html")
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--hui-canvas").trim(),
      ),
  ).toBe("");
  await page.goto(origin + "/?tea_edit=1");
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-tea-visual-loading",
    "",
  );
  expect(
    await page
      .locator("html")
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--hui-canvas").trim(),
      ),
  ).toBe("");
  expect(
    await page
      .locator("body")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(publicCanvas);
  expect(
    await page
      .locator("[data-tea-visual-tools]")
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--hui-canvas").trim(),
      ),
  ).toBe("#f6f7f8");
  if (capture)
    await page.screenshot({
      path: `${capture}/visual-tools-390.png`,
      fullPage: true,
    });
  await visitor.close();
  expect(errors).toEqual([]);
});
