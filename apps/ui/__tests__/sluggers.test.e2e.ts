import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("keeps Sluggers tenant context, unknown statistics, keyboard lineup edits and explicit mock publication inside Scenes", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/scenes/sluggers?theme=clean");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  const scene = page.getByRole("region", {
    name: "Sluggers fixture",
    exact: true,
  });
  await scene.waitFor();
  const tab = (name: string) =>
    scene.getByRole("button", { name, exact: true }).click();
  const choose = async (label: string, option: string) => {
    await scene.getByLabel(label, { exact: true }).click();
    const item = page.getByRole("option", { name: option, exact: true });
    await item.click();
    await item.waitFor({ state: "hidden" });
    await scene
      .getByLabel(label, { exact: true })
      .filter({ hasText: option })
      .waitFor();
  };
  assert.equal(await scene.getAttribute("data-league-id"), "lil-slug");
  await scene
    .getByRole("region", { name: "Lil Slug Crew standings" })
    .waitFor();
  await scene.getByText("Flower conference", { exact: true }).waitFor();
  await choose("League", "Harbor League");
  await scene
    .getByRole("button", {
      name: "The Very Long Named Harbor Tidal Wave Club",
      exact: true,
    })
    .waitFor();
  assert.equal(await scene.getAttribute("data-season-id"), "harbor-s1");
  await choose("League", "Lil Slug Crew");
  await scene.getByRole("button", { name: "Show empty season" }).click();
  await scene
    .getByText(
      "No completed matches this season. The next fixture is still scheduled.",
      { exact: true },
    )
    .waitFor();
  await tab("Box score");
  const batting = scene.getByRole("region", {
    name: "Batting statistics",
    exact: true,
  });
  assert.equal(
    await batting.getByRole("row").filter({ hasText: "Luigi" }).innerText(),
    "Luigi\t—\t—\t—\t—",
  );
  assert.match(
    await batting.getByRole("row").filter({ hasText: "Mario" }).innerText(),
    /4\s+0\s+0\s+0/,
  );
  await choose("Statistics team", "Shell Club · Home");
  await batting.getByRole("row").filter({ hasText: "Wario" }).waitFor();
  await choose("Statistics team", "Fireballs · Away");
  await choose("Result scenario", "Scheduled");
  await batting.waitFor({ state: "hidden" });
  assert.equal(await batting.count(), 0);
  await tab("Lineup");
  const luigiUp = scene.getByRole("button", {
    name: "Move Luigi up",
    exact: true,
  });
  await luigiUp.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await scene.locator("ol li").first().getAttribute("data-character"),
    "Luigi",
  );
  assert.equal(
    await scene
      .getByRole("button", { name: "Move Luigi down", exact: true })
      .evaluate((n) => n === document.activeElement),
    true,
  );
  await scene.getByText("Luigi moved to slot 1.", { exact: true }).waitFor();
  await choose("Luigi defense", "P");
  await scene.getByRole("button", { name: "Save lineup", exact: true }).click();
  await scene
    .getByRole("alert")
    .filter({ hasText: "Assign each defensive position exactly once." })
    .waitFor();
  await choose("Luigi defense", "C");
  await scene
    .getByRole("button", { name: "Simulate save failure", exact: true })
    .click();
  await scene.getByRole("button", { name: "Save lineup", exact: true }).click();
  await scene.getByText("Save failed", { exact: true }).waitFor();
  assert.equal(
    await scene.locator("ol li").first().getAttribute("data-character"),
    "Luigi",
  );
  await scene
    .getByRole("button", { name: "Disable simulated failure", exact: true })
    .click();
  await scene.getByRole("button", { name: "Save lineup", exact: true }).click();
  await scene.getByText("Saved locally", { exact: true }).waitFor();
  await tab("Box score");
  await choose("Result scenario", "Final · incomplete capture");
  assert.match(
    await scene.getByText("1. Mario · P", { exact: true }).innerText(),
    /Mario/,
  );
  await tab("Tracker review");
  const review = scene.getByRole("button", {
    name: "Review replacement…",
    exact: true,
  });
  assert.equal(await review.isDisabled(), true);
  await choose("Map away brand: Custom Red", "Fireballs");
  await choose("Resolve character: Green brother", "Luigi");
  assert.equal(await review.isDisabled(), true);
  await scene.getByRole("checkbox").check();
  await tab("Box score");
  await tab("Tracker review");
  assert.match(
    await scene
      .getByLabel("Map away brand: Custom Red", { exact: true })
      .innerText(),
    /Fireballs/,
  );
  assert.match(
    await scene
      .getByLabel("Resolve character: Green brother", { exact: true })
      .innerText(),
    /Luigi/,
  );
  await review.click();
  const dialog = page.getByRole("dialog", {
    name: "Confirm simulated replacement",
  });
  await dialog.waitFor();
  assert.equal(
    await dialog
      .getByRole("button", { name: "Cancel", exact: true })
      .evaluate((n) => n === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await review.evaluate((n) => n === document.activeElement),
    true,
  );
  await review.click();
  await dialog
    .getByRole("button", { name: "Confirm simulation", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Simulating…", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), true);
  await dialog.waitFor({ state: "hidden" });
  await scene
    .getByText("Simulation published. No real match or standings changed.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await review.evaluate((n) => n === document.activeElement),
    true,
  );
  assert.equal(await review.getAttribute("aria-disabled"), "true");
  await page.keyboard.press("Enter");
  assert.equal(await dialog.isVisible(), false);
  assert.deepEqual(errors, []);
});

it("bounds the four Sluggers examples at mobile, tablet and desktop widths", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.goto("/scenes/sluggers?theme=brutalist");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  const scene = page.getByRole("region", {
    name: "Sluggers fixture",
    exact: true,
  });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ["Standings", "Box score", "Lineup", "Tracker review"]) {
      await scene.getByRole("button", { name, exact: true }).click();
      const size = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
      }));
      assert.ok(
        size.scroll <= size.width + 1,
        `${name} overflows at ${width}: ${size.scroll}`,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await scene.getByRole("button", { name: "Standings", exact: true }).click();
  const region = scene.getByRole("region", { name: "Lil Slug Crew standings" });
  await region.focus();
  assert.equal(
    await region.evaluate((n) => n === document.activeElement),
    true,
  );
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () =>
      (document.querySelector('[aria-label="Lil Slug Crew standings"]')
        ?.scrollLeft ?? 0) > 0,
  );
});
