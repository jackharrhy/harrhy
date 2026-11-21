import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("replays a single prefix through both Markdown policies, then changes phone views", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?view=scenes&scene=clank");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const proof = await page.locator(".scroll").innerText();
  for (const skin of ["Basic", "Newspaper", "Graphite"]) {
    await button(skin).click();
    const session = page.locator(".session").first();
    const prose = page.locator(".measure p").first();
    await button("Standard").click();
    const standard = await session.boundingBox();
    const textSize = await prose.evaluate((n) => getComputedStyle(n).fontSize);
    await button("Compact").click();
    const compact = await session.boundingBox();
    assert.ok(standard && compact && compact.height < standard.height);
    assert.equal(
      await prose.evaluate((n) => getComputedStyle(n).fontSize),
      textSize,
    );
    assert.equal(await page.locator(".scroll").innerText(), proof);
  }
  const step = button("Step");
  // Each manual tick adds eight characters. Stop inside the fence before its closing line.
  for (let i = 0; i < 18; i++) await step.click();
  assert.ok((await page.locator(".tail").innerText()).startsWith("```ts"));
  await button("Words").click();
  assert.match(await page.locator("pre").innerText(), /const bleed/);
  for (let i = 0; i < 19; i++) await step.click();
  assert.ok(await page.getByRole("table").isVisible());
  await button("Tail").click();
  assert.match(await page.locator(".tail").innerText(), /Boundary/);
  await button("Resume").click();
  await page.getByRole("status").filter({ hasText: "Complete" }).waitFor();
  assert.equal(await page.locator(".scroll").innerText(), proof);
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await button("Sessions").boundingBox();
  assert.ok(before && before.height >= 44);
  await button("Sessions").click();
  assert.ok(
    (await page.locator(".session").first().boundingBox())!.height >= 44,
  );
  await page.getByRole("button", { name: /Check the paper profile/ }).click();
  assert.equal(
    await page.locator(".transcript h1").innerText(),
    "Check the paper profile",
  );
  assert.equal(
    await page
      .locator(".transcript h1")
      .evaluate((n) => n === document.activeElement),
    true,
  );
  await button("Overview").click();
  assert.ok(
    await page.getByText("profiles.ts", { exact: true }).last().isVisible(),
  );
  assert.equal(
    await page.locator("body").evaluate((n) => n.scrollWidth <= innerWidth),
    true,
  );
});
