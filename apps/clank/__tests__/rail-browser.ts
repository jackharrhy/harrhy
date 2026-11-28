import assert from "node:assert/strict";
import { join } from "node:path";
import type { Page } from "playwright";
import { proveRailStatus, type StatusFixture } from "./rail-status-browser.ts";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

/** Two live views of the disposable Pi. The actor keeps its Familiar draft;
 * the watcher has the archived session open and must follow the removal. */
export async function proveRailArchive(
  actor: Page,
  watcher: Page,
  pi: Page,
  source: StatusFixture,
) {
  const composer = actor.getByRole("textbox", { name: "Message" });
  const originalURL = actor.url();
  const draft = "Unsent rail fixture draft";

  await button(watcher, "Second session").click();
  await watcher
    .getByRole("heading", { name: "Second session", exact: true })
    .waitFor();
  const message = watcher.getByRole("textbox", { name: "Message" });
  await message.fill("subagent");
  await button(watcher, "Send").click();
  await watcher
    .getByRole("article", { name: "Subagent message" })
    .getByText("Answered", { exact: true })
    .waitFor({ timeout: 15000 });
  // Pi names this new session from its first input.
  const title = "subagent";
  const action = `Archive ${title}`;
  const open = button(actor, title);
  const archive = button(actor, action);
  const disclosure = button(actor, `Subagents for ${title}`);
  await disclosure.waitFor();
  await archive.waitFor({ state: "attached" });
  assert.equal(await button(actor, "Archive Familiar").count(), 0);

  await proveRailStatus(actor, watcher, pi, title, source);
  await archive.waitFor({ state: "attached", timeout: 15000 });

  const row = open.locator("..");
  const age = row.locator(".rail-age");
  const background = () =>
    row.evaluate((el) => getComputedStyle(el).backgroundColor);
  const appearance = () =>
    archive.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.opacity, style.pointerEvents];
    });
  await composer.focus();
  await open.scrollIntoViewIfNeeded();
  await actor.mouse.move(1, 1);
  assert((await age.innerText()).trim(), "idle row has an age");
  assert(await age.isVisible());
  assert.deepEqual(await appearance(), ["0", "none"]);
  const rest = await background();
  const shots = process.env.HARRHY_CLANK_RAIL_SCREENSHOT_DIR;
  if (shots)
    await actor.screenshot({ path: join(shots, "clank-rail-rest.png") });

  await open.hover();
  const hover = await background();
  assert.notEqual(hover, rest, "the row, not just its label, is highlighted");
  const openBox = await open.boundingBox();
  const endBox = await archive.boundingBox();
  const rowBox = await row.boundingBox();
  assert(openBox && endBox && rowBox);
  assert(
    endBox.x > openBox.x &&
      rowBox.x + rowBox.width - (endBox.x + endBox.width) < 8,
    "archive occupies the trailing edge, not the label column",
  );
  for (const target of [open, disclosure, archive]) {
    await target.hover();
    assert.equal(await background(), hover);
    assert.deepEqual(await appearance(), ["1", "auto"]);
    assert.equal(await age.isVisible(), false);
  }
  if (shots) {
    await actor.screenshot({ path: join(shots, "clank-rail-hover.png") });
    const piArchive = button(pi, action);
    await pi.getByRole("link", { name: title, exact: true }).hover();
    await piArchive.hover();
    assert.equal(
      await piArchive.evaluate((el) => getComputedStyle(el).opacity),
      "1",
    );
    await pi.screenshot({ path: join(shots, "p2-rail-hover.png") });
  }

  await actor.mouse.move(1, 1);
  await composer.focus();
  await actor.keyboard.press("Tab");
  await open.focus();
  assert.deepEqual(await appearance(), ["1", "auto"]);
  await actor.keyboard.press("Tab");
  await disclosure.and(actor.locator(":focus")).waitFor();
  await actor.keyboard.press("Tab");
  await archive.and(actor.locator(":focus")).waitFor();
  assert.equal(await age.isVisible(), false);
  const dialog = actor.getByRole("dialog", {
    name: `Archive session “${title}”?`,
  });
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  for (const key of ["Enter", "Escape"]) {
    await archive.press("Enter");
    await cancel.and(actor.locator(":focus")).waitFor();
    await actor.keyboard.press(key);
    await dialog.waitFor({ state: "detached" });
    await archive.and(actor.locator(":focus")).waitFor();
    assert.equal(
      await watcher
        .getByRole("button", { name: title, exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
  }
  // Archive a named child through its session-scoped participant authority.
  // The watcher is reading that child; only it should return to the parent.
  await disclosure.click();
  const childArchive = button(actor, "Archive helper");
  await button(watcher, `Subagents for ${title}`).click();
  await button(watcher, "helper").click();
  await watcher
    .getByLabel("Transcript")
    .getByText("hello helper", { exact: true })
    .waitFor();
  await childArchive.focus();
  await childArchive.press("Enter");
  const childDialog = actor.getByRole("dialog", {
    name: "Archive subagent “helper”?",
  });
  await childDialog
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await childDialog.waitFor({ state: "detached" });
  await disclosure.waitFor({ state: "detached" });
  await watcher
    .getByRole("button", { name: title, pressed: true, exact: true })
    .waitFor();
  await composer.fill(draft);
  await open.hover();
  await archive.click();
  await dialog.getByRole("button", { name: "Archive", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  for (const view of [actor, watcher]) {
    await button(view, title).waitFor({ state: "detached" });
  }
  await watcher
    .getByRole("heading", { name: "New session", exact: true })
    .waitFor();
  await actor
    .getByLabel("Transcript")
    .getByText("Strong receipt", { exact: true })
    .waitFor();
  assert.equal(actor.url(), originalURL);
  assert.equal(new URL(watcher.url()).pathname, "/");
  assert.equal(await composer.inputValue(), draft);
}
