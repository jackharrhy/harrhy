import { test, expect } from "@playwright/test";

test("central owner signs in freshly, enters both tenant editors, and loses access on logout", async ({
  page,
  context,
}) => {
  const origin = "http://operator.localhost:4353";
  await page.goto("http://andrew.localhost:4353/tea/login");
  await expect(page).toHaveURL("http://andrew.localhost:4353/tea/login");
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Local sign-in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue as local user" }).click();
  await expect(page).toHaveURL(origin + "/");
  await expect(
    page.getByRole("heading", { name: "Sites", exact: true }),
  ).toBeVisible();
  const cookies = await context.cookies(origin);
  expect(
    cookies.find((cookie) => cookie.name === "tea-operator-session")?.httpOnly,
  ).toBe(true);
  expect(
    cookies.some(
      (cookie) => cookie.name === "tea-operator-oauth" && cookie.value,
    ),
  ).toBe(false);
  for (const site of ["andrew", "luke"]) {
    await page
      .getByRole("button", { name: `Open Central ${site} editor` })
      .click();
    await expect(page).toHaveURL(`http://${site}.localhost:4353/tea/admin`);
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: /^Sites/ }).click();
    await expect(page).toHaveURL(origin + "/");
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(origin + "/login");
  await page.goto("http://andrew.localhost:4353/tea/admin");
  await expect(page).toHaveURL("http://andrew.localhost:4353/tea/login");
});
