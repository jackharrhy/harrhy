import { chromium } from "playwright";
import assert from "node:assert/strict";
const origin = process.env.HARRHY_SLUGGERS_TEST_URL ?? "http://127.0.0.1:18950";
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(() => {
    window.sluggersNavigationProbe = true;
  });
  await page
    .getByRole("navigation", { name: "League", exact: true })
    .getByRole("link", { name: "Players", exact: true })
    .click();
  await page.waitForURL("**/players");
  assert.equal(
    await page.evaluate(() => window.sluggersNavigationProbe),
    true,
    "Remix navigation should preserve the document",
  );
  const player = await page
    .locator('main a[href^="/players/"]')
    .first()
    .getAttribute("href");
  await page.goto(`${origin}/teams`);
  const team = await page
    .locator('main a[href^="/teams/"]')
    .first()
    .getAttribute("href");
  await page.goto(`${origin}/matches`);
  const match = await page
    .locator('main a[href^="/matches/"]')
    .first()
    .getAttribute("href");
  const day = await page
    .locator('main a[href^="/days/"]')
    .first()
    .getAttribute("href");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of [
      "broadcast-prism",
      "broadcast-float",
      "frost-studio",
      "frost-ribbon",
      "pennant-broadcast",
      "dugout-frost",
    ]) {
      for (const path of [
        "/",
        "/players",
        player,
        "/teams",
        team,
        `${team}/lineup`,
        "/matches",
        day,
        match,
        `${match}/lineup`,
        `${match}/stats`,
        "/draft",
        "/events",
        "/trades",
      ]) {
        const response = await page.goto(`${origin}${path}?theme=${theme}`);
        assert.equal(response.status(), 200, `${path} ${theme}`);
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          broken: [...document.images].filter(
            (image) => image.complete && !image.naturalWidth,
          ).length,
        }));
        assert.ok(
          layout.scroll <= layout.width,
          `${path} at ${width} overflows`,
        );
        assert.equal(layout.broken, 0, `${path} has broken images`);
      }
    }
  }
  await page.goto(`${origin}/players`);
  const totalPlayers = await page.locator("[data-roster-card]").count();
  await page.getByLabel("Player name").fill("Mario");
  await page.getByRole("button", { name: "Find players" }).click();
  await page.waitForURL("**/players?*");
  await page.waitForFunction(
    (total) => document.querySelectorAll("[data-roster-card]").length < total,
    totalPlayers,
  );
  assert.match(await page.locator("main").innerText(), /Mario/);
  await page.locator('select[name="theme"]').selectOption("frost-studio");
  await page.getByRole("button", { name: "Apply style" }).click();
  await page.waitForURL("**theme=frost-studio**");
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "frost-studio",
  );
  await page
    .getByRole("navigation", { name: "League", exact: true })
    .getByRole("link", { name: "Teams", exact: true })
    .click();
  await page.waitForURL("**/teams");
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "frost-studio",
  );
  assert.equal(
    await page.locator("html").getAttribute("data-theme"),
    "frost-studio",
  );
  assert.deepEqual(errors, []);
  console.log(
    "336 live-data route/theme/viewport checks passed; Remix navigation, search and theme persistence passed.",
  );
} finally {
  await browser.close();
}
