import { test, expect, type Page, type Locator } from "@playwright/test";
import { credentials } from "./fixture.ts";

async function login(page: Page, site: string) {
  const origin = `http://${site}.localhost:4352`;
  await page.goto(origin + "/tea/login");
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#workspace")).not.toHaveAttribute("inert", "");
  return origin;
}

async function selectWithFocus(page: Page, trigger: Locator, label: string) {
  await trigger.click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(trigger).toHaveText(label);
  await expect(trigger).toBeFocused();
  await trigger.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(trigger).not.toBeFocused();
}

test("Luke navigation Select preserves focus for pointer and keyboard selection", async ({
  page,
}) => {
  const origin = await login(page, "luke");
  await page.goto(origin + "/tea/admin/sidebar");
  await expect(page.locator("#workspace")).not.toHaveAttribute("inert", "");
  await selectWithFocus(
    page,
    page.getByLabel("Page", { exact: true }).first(),
    "Homepage",
  );
});

test("Visual content stays inert while editing modules load", async ({
  page,
}) => {
  const origin = await login(page, "luke");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/**", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(origin + "/?tea_edit=1", { waitUntil: "commit" });
    const content = page.locator("[data-tea-visual-content]");
    await expect(content).toHaveAttribute("inert", "");
    await page.keyboard.press("Tab");
    expect(
      await content.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(false);
    release();
    await expect(content).not.toHaveAttribute("inert", "");
    const field = page.locator("[data-preview-key]").first();
    await field.focus();
    await field.press("Enter");
    await expect(
      page.getByRole("textbox", { name: "Block text" }),
    ).toBeFocused();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
