import * as assert from "remix/assert";
import { it } from "remix/test";
import { createTestServer } from "remix/node-fetch-server/test";
import { concepts } from "../app/public/sluggers/lab/concepts/index.ts";
import { createLabFixture } from "./sluggers-lab-fixture.ts";

it("switches cookoff concepts and screens without reloading and keeps field markers accessible", async (t) => {
  const app = await createLabFixture((cleanup) => t.after(cleanup));
  const page = await t.serve(await createTestServer(app.fetch));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const containerWidth of [480, 481]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/sluggers-lab?concept=dugout-frost&screen=lineup");
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    const field = page.locator("[data-baseball-field-wrapper]");
    await field.evaluate((element, width) => {
      element.style.width = `${width}px`;
      element.style.maxWidth = "none";
    }, containerWidth);
    assert.equal(await field.locator("button:visible").count(), 9);
    assert.equal(
      await field.evaluate((element) => {
        const rects = [...element.querySelectorAll("button")]
          .filter((b) => b.getClientRects().length)
          .map((b) => b.getBoundingClientRect());
        return rects.every(
          (a, i) =>
            a.width >= 44 &&
            a.height >= 44 &&
            rects
              .slice(i + 1)
              .every(
                (b) =>
                  Math.min(a.right, b.right) <= Math.max(a.left, b.left) ||
                  Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top),
              ),
        );
      }),
      true,
    );
  }
  for (const [width, conceptId] of [
    [320, "dugout-frost"],
    [1440, "broadcast-float"],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/sluggers-lab?concept=broadcast-prism&screen=lineup");
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    // An in-place switch must keep the current screen and document alive.
    await page
      .locator("html")
      .evaluate((node) => node.setAttribute("data-smoke-document", ""));
    const screens = page.getByRole("navigation", { name: "League screens" });
    const recipes = page.getByRole("navigation", { name: "Design concepts" });
    const concept = concepts.find((variant) => variant.id === conceptId)!;
    await recipes
      .getByRole("button", { name: concept.name, exact: true })
      .click();
    assert.match(page.url(), new RegExp(`concept=${concept.id}`));
    const backdrop = await page
      .locator("[data-sluggers-lab]")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.backgroundColor,
          image: style.backgroundImage,
          size: style.backgroundSize,
          position: style.backgroundPosition,
          animation: style.animationName,
        };
      });
    assert.equal(backdrop.color, "rgb(29, 86, 191)");
    assert.equal((backdrop.image.match(/radial-gradient/g) ?? []).length, 2);
    assert.match(backdrop.size, /112px 112px, 112px 112px/);
    assert.match(backdrop.position, /0px 0px, 56px 56px/);
    assert.equal(backdrop.animation, "none");
    assert.equal(await page.locator("html[data-smoke-document]").count(), 1);
    assert.equal(
      await page.locator("[data-sluggers-lab]").getAttribute("data-screen"),
      "lineup",
    );
    assert.equal(await page.locator("[data-batting-order] li").count(), 9);
    assert.equal(
      await page
        .locator("[data-baseball-field-wrapper] button:visible")
        .count(),
      9,
    );
    assert.equal(await page.locator("[data-roster-card]").count(), 12);
    assert.equal(
      await page.locator("[data-baseball-field-wrapper]").evaluate((field) => {
        const rects = [...field.querySelectorAll("button")]
          .filter((button) => button.getClientRects().length > 0)
          .map((button) => button.getBoundingClientRect());
        return (
          rects.every((rect) => rect.width >= 44 && rect.height >= 44) &&
          rects.every((a, index) =>
            rects
              .slice(index + 1)
              .every(
                (b) =>
                  Math.min(a.right, b.right) <= Math.max(a.left, b.left) ||
                  Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top),
              ),
          )
        );
      }),
      true,
      `non-overlapping field targets ${concept.id} ${width}`,
    );
    const marker = page
      .locator("[data-baseball-field-wrapper] button:visible")
      .nth(1);
    await marker.focus();
    await page.keyboard.press("Enter");
    assert.equal(await marker.getAttribute("aria-pressed"), "true");
    assert.equal(
      await marker.evaluate((n) => n === document.activeElement),
      true,
    );
    await screens
      .getByRole("button", { name: "Box score", exact: true })
      .click();
    assert.equal(
      await page
        .locator("[data-baseball-scoreboard]")
        .evaluate(
          (region) =>
            getComputedStyle(region).color ===
            getComputedStyle(region.querySelector("th")!).color,
        ),
      true,
      `scoreboard header inherits ink ${concept.id}`,
    );
    await screens
      .getByRole("button", { name: "Match day", exact: true })
      .click();
    assert.equal(await page.locator("[data-match]").count(), 5);
    assert.equal(
      await page
        .locator("[data-match-score]")
        .first()
        .evaluate((element) => {
          const rects = [...element.children].map((child) => {
            const range = document.createRange();
            range.selectNodeContents(child);
            return range.getBoundingClientRect();
          });
          return (
            rects[0]!.right <= rects[1]!.left &&
            rects[1]!.right <= rects[2]!.left
          );
        }),
      true,
      `aligned two-digit numeric score slots ${concept.id} ${width}`,
    );
    await screens
      .getByRole("button", { name: "Player catalogue", exact: true })
      .click();
    assert.equal(await page.locator("[data-roster-card]").count(), 120);
    assert.equal(
      await page
        .locator("[data-roster-card]")
        .first()
        .evaluate((element) => {
          const icon = element
            .querySelector("[data-player-icon]")!
            .getBoundingClientRect();
          return (
            icon.width === 32 &&
            icon.height === 32 &&
            element.getBoundingClientRect().height >= 44
          );
        }),
      true,
      `compact visual icon inside accessible card ${concept.id}`,
    );
    assert.equal(
      await page.locator("[data-roster-grid]").evaluate((grid) => {
        const rows = new Map<number, number[]>();
        for (const card of grid.querySelectorAll("[data-roster-card]")) {
          const top = Math.round(card.getBoundingClientRect().top);
          const bottom = card
            .querySelector("[data-card-stats]")!
            .getBoundingClientRect().bottom;
          rows.set(top, [...(rows.get(top) ?? []), bottom]);
        }
        return [...rows.values()].every(
          (bottoms) => Math.max(...bottoms) - Math.min(...bottoms) <= 1,
        );
      }),
      true,
      `aligned stat baselines despite long names ${concept.id} ${width}`,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `${concept.id} ${width}`,
    );
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  for (const concept of concepts.filter((c) => c.parts.panelSurface)) {
    await page.goto(`/sluggers-lab?concept=${concept.id}&screen=matchday`);
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    const panel = await page
      .locator("[data-lab-panel]")
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.backgroundColor,
          image: style.backgroundImage,
          filter: style.backdropFilter,
          diffusion: getComputedStyle(element, "::before").display,
        };
      });
    assert.deepEqual(
      panel,
      {
        color: "rgb(29, 86, 191)",
        image: "none",
        filter: "none",
        diffusion: "none",
      },
      `opaque reduced-transparency fallback ${concept.id}`,
    );
  }
  await cdp.detach();
  assert.deepEqual(errors, []);
});
