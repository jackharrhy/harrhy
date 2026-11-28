import assert from "node:assert/strict";
import { join } from "node:path";
import type { Locator, Page } from "playwright";

// Reuse owner-browser's authenticated Chromium phone, on the main conversation
// containing the settled Words receipt. Do not create, edit or archive a session.
export async function checkCanonicalSwipe(phone: Page, eligibleTitle: string) {
  const route = phone.url();
  assert.equal(new URL(route).origin, "https://clank.example.test");
  const width = phone.viewportSize()!.width;
  const travel = Math.round(width * 0.6); // commits by position even without a fling
  const cdp = await phone.context().newCDPSession(phone);
  const rail = phone.locator('aside[aria-label="Session list"]'); // may be inert mid-swipe
  const show = phone.getByRole("button", {
    name: "Show sessions",
    exact: true,
  });
  const archive = rail.getByRole("button", {
    name: `Archive ${eligibleTitle}`,
    exact: true,
  });
  const row = rail.getByRole("button", { name: eligibleTitle, exact: true });
  const current = rail.getByRole("button", { pressed: true });
  const transcript = phone.getByLabel("Transcript");
  const prose = transcript
    .locator("strong")
    .filter({ hasText: /^Strong receipt$/ });
  const fence = transcript
    .locator('[data-markdown="code-block"]')
    .filter({ hasText: "const answer = 42;" });
  const dir = process.env.HARRHY_CLANK_RAIL_SCREENSHOT_DIR;
  async function shot(name: string) {
    if (dir)
      await phone.screenshot({ path: join(dir, `clank-phone-${name}.png`) });
  }
  async function drag(
    from: Locator,
    dx: number,
    held?: () => Promise<void>,
    cancel = false,
  ) {
    await from.scrollIntoViewIfNeeded();
    const start = await from.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const x = Math.round(b.x + Math.min(b.width / 2, 20));
      const y = Math.round(b.y + b.height / 2);
      if (!el.contains(document.elementFromPoint(x, y)))
        throw Error(`Obscured drag start: ${el.tagName}`);
      return { x, y };
    });
    assert(start.x + dx > 0 && start.x + dx < width, "drag must end on screen");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    try {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: start.x + dx, y: start.y }],
      });
      await held?.();
    } finally {
      await cdp.send("Input.dispatchTouchEvent", {
        type: cancel ? "touchCancel" : "touchEnd",
        touchPoints: [],
      });
    }
  }
  async function detail() {
    await rail.waitFor({ state: "hidden" });
    await show.waitFor();
    assert.equal(phone.url(), route, "swiping must retain the conversation");
  }
  async function list() {
    await show.waitFor({ state: "hidden" });
    await current.waitFor();
    assert.equal(await row.getAttribute("aria-pressed"), "false");
    assert.equal(phone.url(), route);
  }
  async function partial() {
    const box = await rail.boundingBox();
    assert(
      box && Math.abs(box.x + box.width - travel) < 4,
      "rail must track the finger before release",
    );
  }
  try {
    await phone.emulateMedia({ reducedMotion: "no-preference" });
    await detail();
    await show.tap();
    await list();
    await archive.scrollIntoViewIfNeeded();
    await shot("rail-open");
    // Above gesture slop but still a Chromium compatibility click. Start directly
    // on each control, in the rejected direction, and keep the release on it.
    for (const action of [archive, row]) {
      await drag(action, 9);
      assert.equal(
        await phone.locator("dialog[open]").count(),
        0,
        "drag opened confirmation",
      );
      await list();
    }
    await archive.tap();
    const confirm = phone.getByRole("dialog", {
      name: `Archive session “${eligibleTitle}”?`,
      exact: true,
    });
    await confirm.waitFor();
    assert(
      await confirm
        .getByRole("button", { name: "Archive", exact: true })
        .isEnabled(),
    );
    await shot("archive-confirmation");
    await confirm.getByRole("button", { name: "Cancel", exact: true }).tap();
    await confirm.waitFor({ state: "hidden" });
    await list();
    await current.tap();
    await detail();

    await drag(
      prose,
      travel,
      async () => {
        await partial();
        await shot("rail-mid-swipe");
      },
      true,
    );
    await detail(); // cancel beyond the commit threshold must still roll back
    for (const target of [
      fence.locator("pre code"),
      fence.locator('[data-markdown="code-header"]'), // inside the fence but outside pre/code
      phone.getByRole("textbox", { name: "Message" }),
    ]) {
      await drag(target, travel, async () =>
        assert(await rail.isHidden(), `rail stole drag from ${String(target)}`),
      );
      await detail();
    }
    await drag(prose, travel);
    await list();
    await drag(archive, -travel);
    await detail();
    assert.equal(await phone.locator("dialog[open]").count(), 0);

    await phone.emulateMedia({ reducedMotion: "reduce" });
    await drag(prose, travel, async () =>
      assert(await rail.isHidden(), "reduced motion must not slide"),
    );
    await list();
    await drag(archive, -travel);
    await detail();
  } finally {
    await cdp.detach();
    await phone.emulateMedia({ reducedMotion: null });
  }
}
