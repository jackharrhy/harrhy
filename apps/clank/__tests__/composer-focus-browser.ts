import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

// Call on an idle, hydrated fixture conversation. Never type or submit a draft.
export async function checkComposerFocus(page: Page) {
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  const shots = process.env.HARRHY_CLANK_STATUS_SCREENSHOT_DIR;
  if (shots) await mkdir(shots, { recursive: true });
  const sample = () =>
    message.evaluate((field) => {
      const panel = field.parentElement!;
      const rect = panel.getBoundingClientRect();
      const input = field.getBoundingClientRect();
      const css = getComputedStyle(panel);
      if (
        rect.left < 0 ||
        rect.top < 0 ||
        rect.right > innerWidth ||
        rect.bottom > innerHeight ||
        document.documentElement.scrollWidth > innerWidth
      )
        throw Error("Composer page overflows the viewport");
      return {
        border: css.borderTop,
        panel: rect.toJSON(),
        field: input.toJSON(),
        // Include the empty space above the field: a second focus rule here is a regression too.
        divider: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: input.y - rect.y,
        },
        // Exclude the field itself, so a blinking caret cannot pass for a focus indicator.
        gutter: {
          x: rect.x,
          y: input.y,
          width: input.x - rect.x,
          height: input.height,
        },
      };
    });

  try {
    for (const forcedColors of ["none", "active"] as const) {
      await page.emulateMedia({ forcedColors });
      await message.focus();
      await message.evaluate((node) => node.blur());
      const idle = await sample();
      assert.match(idle.border, /^1px solid /);
      const divider = await page.screenshot({ clip: idle.divider });
      const gutter = await page.screenshot({ clip: idle.gutter });
      const prefix = `composer-${page.viewportSize()?.width}-${forcedColors}`;
      if (shots)
        await page.screenshot({ path: join(shots, `${prefix}-idle.png`) });

      // Reach Message by tab order even if there are focusable entries in Transcript.
      await message.press("Shift+Tab");
      await page.keyboard.press("Tab");
      assert(await message.evaluate((node) => node.matches(":focus-visible")));
      assert.deepEqual(
        await sample(),
        idle,
        "Focus changed the rule or composer layout",
      );
      assert(
        divider.equals(await page.screenshot({ clip: idle.divider })),
        "Divider paint changed",
      );
      assert(
        !gutter.equals(await page.screenshot({ clip: idle.gutter })),
        "No visible gutter cue",
      );
      if (shots)
        await page.screenshot({ path: join(shots, `${prefix}-focused.png`) });
    }
  } finally {
    await page.emulateMedia({ forcedColors: null });
    await message.evaluate((node) => node.blur());
  }
}
