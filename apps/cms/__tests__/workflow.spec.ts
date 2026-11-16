import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

async function choose(page: Page, trigger: Locator, label: string) {
  await trigger.click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(trigger).toHaveText(label);
}
import { credentials } from "./fixture.ts";

async function captureSelect(page: Page, trigger: Locator, name: string) {
  const directory = process.env.HARRHY_CMS_UI_SCREENSHOTS;
  if (!directory) return;
  const viewport = page.viewportSize();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const closeNavigation = page.locator("#close-cms-navigation");
    if (
      width === 390 &&
      (await closeNavigation.isVisible()) &&
      !(await page.getByRole("dialog").isVisible())
    ) {
      await closeNavigation.click();
    }
    await trigger.click();
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.screenshot({
      path: join(directory, `${name}-${width}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
  }
  if (viewport) await page.setViewportSize(viewport);
}

for (const site of ["andrew", "luke"]) {
  test(`${site}: native editor, drafts, publishing, settings and feature controls`, async ({
    page,
    browser,
  }) => {
    const origin = `http://${site}.localhost:4352`;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/tea/login");
    await page.getByLabel("Email address").fill(credentials.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(credentials.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(origin + "/tea/admin");
    await expect(page.locator("#workspace")).not.toHaveAttribute("inert", "");
    await page.goto(origin + "/tea/admin/homepage");
    await expect(page.locator("#workspace")).not.toHaveAttribute("inert", "");
    const riso = page.getByRole("button", {
      name: "+ Riso colors",
      exact: true,
    });
    if (site === "andrew") await expect(riso).toBeVisible();
    else await expect(riso).toHaveCount(0);
    // Shared Select must follow restored block props, not retain its first default.
    const headingSize = page.getByLabel("Heading size");
    await expect(headingSize).toHaveText("Heading 1");
    await captureSelect(page, headingSize, `${site}-heading-select`);
    await choose(page, headingSize, "Heading 3");
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(headingSize).toHaveText("Heading 1");
    await page.getByRole("button", { name: /Redo/ }).click();
    await expect(headingSize).toHaveText("Heading 3");
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(headingSize).toHaveText("Heading 1");
    await page.getByRole("button", { name: "+ Image", exact: true }).click();
    const chooseImage = page.getByRole("button", {
      name: "Choose image",
      exact: true,
    });
    await chooseImage.click();
    const imageDialog = page.getByRole("dialog", { name: "Choose an image" });
    await expect(imageDialog.getByLabel("Search images")).toBeFocused();
    await expect(imageDialog).toHaveCSS("width", "900px");
    await captureSelect(
      page,
      imageDialog.getByLabel("Image folder"),
      `${site}-media-dialog`,
    );
    await choose(page, imageDialog.getByLabel("Image folder"), "Unfiled");
    await page.keyboard.press("Escape");
    await expect(imageDialog).not.toBeVisible();
    await expect(chooseImage).toBeFocused();
    await page.getByRole("button", { name: /Undo/ }).click();
    const fields = page.locator('[contenteditable="true"]');
    await expect(fields.first()).toBeVisible();
    await fields.first().fill(`Edited ${site} heading`);
    const paragraph = fields.nth(1);
    const paragraphText = `Formatted ${site} text`;
    await paragraph.fill(paragraphText);
    await paragraph.press("ControlOrMeta+A");
    const paragraphEditor = paragraph.locator(
      "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' rich-text-wrap ')][1]",
    );
    await paragraphEditor
      .getByRole("button", { name: "Bold", exact: true })
      .click();
    await expect(paragraph.locator("strong")).toHaveText(paragraphText);
    await paragraph.focus();
    await paragraph.press("ControlOrMeta+A");
    await paragraphEditor
      .getByRole("button", { name: "Link", exact: true })
      .click();
    await paragraphEditor
      .getByLabel("Link URL")
      .fill("https://example.test/selected-text");
    await paragraphEditor
      .getByRole("button", { name: "Apply", exact: true })
      .click();
    await expect(paragraph.locator("a")).toHaveAttribute(
      "href",
      "https://example.test/selected-text",
    );
    await expect(paragraph.locator("a strong, strong a")).toHaveText(
      paragraphText,
    );
    if (site === "andrew") await riso.click();
    await expect(
      page.getByText("Draft saved", { exact: true }).first(),
    ).toBeVisible({ timeout: 15000 });
    const visitor = await browser.newPage();
    await visitor.goto(origin);
    await expect(
      visitor.getByRole("heading", { name: `Edited ${site} heading` }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(
      page.getByText("Published", { exact: true }).first(),
    ).toBeVisible();
    await visitor.reload();
    await expect(
      visitor.getByRole("heading", { name: `Edited ${site} heading` }),
    ).toBeVisible();
    if (site === "andrew") {
      const ink = visitor
        .getByRole("button", { name: /Copy .+ color/ })
        .first();
      await ink.click();
      await expect(ink).toHaveText(/Copied!|^rgb\(/);
    }
    await visitor.close();
    await page.goto(origin + "/tea/admin/sidebar");
    await expect(page.locator("#workspace")).not.toHaveAttribute("inert", "");
    await page.goto(origin + "/tea/admin/site");
    await expect(page.locator("#workspace")).not.toHaveAttribute("inert", "");
    await page
      .getByLabel("Google Analytics measurement ID")
      .fill("G-FIXTURE123");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(
      page.getByText("Site settings saved.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Google Analytics measurement ID"),
    ).toHaveValue("G-FIXTURE123");
    await page.goto(origin + "/tea/admin/media");
    await page.getByRole("button", { name: "New folder", exact: true }).click();
    let folderDialog = page.getByRole("dialog", { name: "New folder" });
    await expect(folderDialog.getByLabel("Folder name")).toBeFocused();
    await folderDialog.getByLabel("Folder name").fill("Select parent");
    await folderDialog.getByRole("button", { name: "Save folder" }).click();
    await expect(folderDialog).not.toBeVisible();
    await page.getByRole("button", { name: "New folder", exact: true }).click();
    folderDialog = page.getByRole("dialog", { name: "New folder" });
    const inside = folderDialog.getByLabel("Inside");
    await expect(inside).toHaveText("Select parent");
    await choose(page, inside, "Library");
    await folderDialog
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    // Reopening changes the app-owned default back to the selected parent.
    await page.getByRole("button", { name: "New folder", exact: true }).click();
    await expect(inside).toHaveText("Select parent");
    await folderDialog
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await choose(page, page.getByLabel("Filter media"), "Images");
    await choose(page, page.getByLabel("Filter media"), "All files");
    await page.goto(origin);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("link", { name: "Example page", exact: true }),
      ).toBeVisible({ visible: width === 1440 });
      await page.screenshot({
        path: `tmp/${site}-${width}.png`,
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });
}
