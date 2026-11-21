import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { expect } from "@playwright/test";

export async function checkBrowserExport(page, archiveToken) {
  await page.getByRole("link", { name: "Export archive" }).click();
  const input = page.getByLabel("Archive access token");
  const start = page.getByRole("button", { name: "Start export" });
  const check = page.getByRole("button", { name: "Check status" });
  const download = page.getByRole("button", { name: "Download archive" });
  const status = page.getByRole("status");
  await expect(start).toBeDisabled();

  const endpoint = new URL("/api/archive/exports", page.url()).href;
  assert.equal((await page.request.post(endpoint)).status(), 401);
  await input.fill(archiveToken);
  await start.click();
  await expect(status).toHaveText(/Building archive|Archive ready/);
  const deadline = Date.now() + 60_000;
  while (!(await download.isEnabled())) {
    assert.ok(Date.now() < deadline, "Archive did not become ready");
    await delay(500);
    await check.click();
    await expect(status).toHaveText(/Building archive|Archive ready/);
  }

  // Changing the credential after readiness must not confer download access.
  await input.fill("invalid-local-token");
  await download.click();
  await expect(status).toContainText("Access denied");
  await expect(input).toBeEmpty();
  await input.fill(archiveToken);
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    download.click(),
  ]);
  assert.equal(await file.failure(), null);
  await expect(input).toBeEmpty();
  return file.path();
}
