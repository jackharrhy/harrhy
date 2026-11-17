import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createManagementFixture } from "../fixtures/management-server.mjs";

const browser = await chromium.launch();
try {
  for (const mode of ["disabled", "provisioning-only", "empty-override"]) {
    const enabled = mode === "provisioning-only";
    const fixture = await createManagementFixture({
      mediaWrites: mode === "empty-override",
      mediaProvisioningOnly: enabled,
      mediaProvisioningDisabled: mode === "empty-override",
    });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();
      await page.goto(fixture.origin + "/login");
      await page.getByLabel("Username or email").fill("operator");
      await page
        .getByLabel("Password", { exact: true })
        .fill("fixture-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(fixture.origin + "/");
      await page.goto(
        fixture.origin + "/manage/media/jellyfin/synthetic-server",
      );
      await page
        .getByRole("link", { name: "Create account", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Create Jellyfin account", exact: true })
        .waitFor();
      if (enabled) {
        await page
          .getByRole("button", {
            name: "Review new native account",
            exact: true,
          })
          .waitFor();
        assert((await page.locator('input[name="folderId"]').count()) > 0);
      } else {
        await page
          .getByRole("heading", {
            name: "Account creation is not enabled for Synthetic Jellyfin",
          })
          .waitFor();
        assert.equal(
          await page.locator('form[action*="provisioning"]').count(),
          0,
        );
        assert.equal(fixture.logs.includes("request_failed"), false);
      }
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        if (process.env.AUTH_SCREENSHOT_DIR) {
          await mkdir(process.env.AUTH_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({
            path: `${process.env.AUTH_SCREENSHOT_DIR}/provisioning-${mode}-${width}.png`,
            fullPage: true,
          });
        }
      }
      await page.goto(
        fixture.origin +
          "/manage/media/provisioning?service=seerr&instance=synthetic-server",
      );
      await page
        .getByRole("heading", {
          name: "Account creation is not enabled for Synthetic Seerr",
        })
        .waitFor();
      assert.equal(
        await page.locator('form[action*="provisioning"]').count(),
        0,
      );
      if (enabled) {
        await page.goto(
          fixture.origin + "/manage/media/jellyfin/synthetic-server",
        );
        await page
          .getByRole("link", { name: "Morgan Native", exact: true })
          .click();
        await page
          .getByRole("link", { name: "Link Auth identity", exact: true })
          .click();
        await page.getByLabel("Existing Auth identity").selectOption("member");
        await page
          .getByLabel("Reason")
          .fill("Synthetic provisioning-only boundary check");
        await page
          .getByRole("button", { name: "Review identity link", exact: true })
          .click();
        await page.getByRole("checkbox").check();
        await page
          .getByRole("button", {
            name: "Record reviewed identity link",
            exact: true,
          })
          .click();
        await page
          .getByRole("link", { name: "Back to account", exact: true })
          .click();
        await page
          .getByRole("link", { name: "Disable account", exact: true })
          .click();
        await page
          .getByLabel("Reason")
          .fill("Must not enable lifecycle with provisioning-only config");
        await page
          .getByRole("button", {
            name: "Review native account disable",
            exact: true,
          })
          .click();
        await page
          .getByText(
            "The identity service could not complete this request. Please try again.",
            { exact: true },
          )
          .waitFor();
        assert(fixture.logs.includes('"status":503'));
      }
      assert.equal(fixture.nativeCreations, 0);
      assert.equal(fixture.nativeWrites, 0);
      assert.equal(fixture.seerrImports, 0);
      assert.equal(fixture.seerrDeletes, 0);
    } finally {
      await context.close();
      await fixture.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  "PASS provisioning availability: honest disabled GET; Jellyfin-only provisioning does not enable Seerr or lifecycle writes.",
);
