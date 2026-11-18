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
  const surfaces = new Map();
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
        if (width === 1440) {
          const paint = await page
            .locator(`select[name="theme"]`)
            .evaluate((el) => getComputedStyle(el).backgroundColor);
          const card = page.locator("main [data-roster-card]").first();
          const cardPaint = (await card.count())
            ? await card.evaluate((el) => getComputedStyle(el).backgroundColor)
            : null;
          const score = page.locator("main [data-score] a").first();
          const scorePaint = (await score.count())
            ? await score.evaluate((el) => getComputedStyle(el).backgroundColor)
            : null;
          const entries = surfaces.get(path) ?? [];
          entries.push({ paint, cardPaint, scorePaint });
          surfaces.set(path, entries);
        }
      }
    }
  }
  for (const [path, entries] of surfaces) {
    for (const role of ["paint", "cardPaint", "scorePaint"]) {
      const actual = entries.map((entry) => entry[role]).filter(Boolean);
      if (actual.length)
        assert.equal(
          new Set(actual).size,
          6,
          `${path}: ${role} must visibly respond to all six themes`,
        );
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
  assert.equal(
    await page.getByRole("button", { name: "Apply style" }).count(),
    0,
  );
  await page.waitForURL("**theme=frost-studio**");
  assert.equal(new URL(page.url()).searchParams.get("q"), "Mario");
  const card = page.locator("[data-player-card]").first();
  assert.equal(
    await card
      .locator("h3 a")
      .evaluate((el) => getComputedStyle(el).textDecorationLine),
    "none",
  );
  assert.equal((await card.locator("[data-portrait]").boundingBox()).width, 56);
  assert.ok(
    await card.getByRole("img", { name: "Captain", exact: true }).count(),
  );
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
