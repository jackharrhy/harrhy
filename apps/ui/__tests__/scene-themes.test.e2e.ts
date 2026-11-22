import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("switches the actual Radio and Sluggers surfaces without remounting their fixtures", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  for (const scene of ["radio", "sluggers"]) {
    await page.goto(`/scenes/${scene}?theme=clean`);
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    const surface = page.locator(
      scene === "radio" ? "[data-radio-shell]" : "[data-sluggers]",
    );
    if (scene === "sluggers")
      await surface
        .getByRole("button", { name: "Box score", exact: true })
        .click();
    await surface.evaluate((node) =>
      node.setAttribute("data-test-same-node", "true"),
    );
    for (const [label, id, ink] of [
      ["Scorebook", "sluggers", "rgb(255, 255, 255)"],
      ["Newspaper", "brutalist", "rgb(17, 17, 17)"],
      ["Basic", "clean", "rgb(25, 33, 38)"],
    ] as const) {
      await page.getByRole("button", { name: "Theme", exact: true }).click();
      await page.getByRole("option", { name: label, exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("theme") === id);
      assert.equal(
        await surface.evaluate((node) => getComputedStyle(node).color),
        ink,
      );
      assert.equal(await surface.getAttribute("data-test-same-node"), "true");
      if (scene === "sluggers")
        assert.equal(
          await surface
            .getByRole("button", { name: "Box score", exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
    }
  }
});
