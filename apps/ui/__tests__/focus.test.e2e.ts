import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("draws a contrasting keyboard outline across themes and in forced colors", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/scenes/themes");
  for (const forcedColors of ["none", "active"] as const) {
    await page.emulateMedia({ forcedColors });
    for (const theme of [
      "basic",
      "dial",
      "newspaper",
      "scorebook",
      "graphite",
      "jello",
    ]) {
      const specimen = page.locator(`[data-comparison="${theme}"]`);
      const button = specimen.getByRole("button", { name: "Save collection" });
      await button.click();
      assert.equal(
        await button.evaluate((node) => node.matches(":focus-visible")),
        false,
      );
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      const focus = await button.evaluate((node) => {
        const style = getComputedStyle(node);
        const background = getComputedStyle(
          node.closest("section")!,
        ).backgroundColor;
        const luminance = (color: string) => {
          const [r, g, b] = color.match(/\d+/g)!.map((value) => {
            const s = Number(value) / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const colors = [style.outlineColor, background].map(luminance);
        return {
          visible:
            node === document.activeElement && node.matches(":focus-visible"),
          outline: [
            style.outlineStyle,
            style.outlineWidth,
            style.outlineOffset,
          ],
          contrast: (Math.max(...colors) + 0.05) / (Math.min(...colors) + 0.05),
        };
      });
      assert.equal(focus.visible, true, theme);
      assert.deepEqual(
        focus.outline,
        ["solid", forcedColors === "active" ? "2px" : "1px", "2px"],
        theme,
      );
      assert.ok(
        focus.contrast >= 3,
        `${theme} (${forcedColors}): ${focus.contrast.toFixed(2)}:1 against panel base color`,
      );
    }
  }
});
