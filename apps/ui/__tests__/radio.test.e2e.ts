import * as assert from "remix/assert";
import { createTestServer } from "remix/node-fetch-server/test";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";

it("ports Radio queue, transport and keyboard behavior without a runtime connection", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  const requests: string[] = [];
  let fixtureOrigin: string | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!fixtureOrigin && request.isNavigationRequest())
      fixtureOrigin = url.origin;
    // Remix's browser harness loads local blob modules; these make no network request.
    if (url.protocol === "blob:" && url.origin === fixtureOrigin) return;
    if (
      request.method() !== "GET" ||
      url.origin !== fixtureOrigin ||
      (url.pathname !== "/" && !url.pathname.startsWith("/assets/"))
    )
      requests.push(request.method() + " " + request.url());
  });
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "radioRuntimeCalls", { value: calls });
    for (const name of [
      "WebSocket",
      "AudioContext",
      "webkitAudioContext",
      "Audio",
    ])
      Object.defineProperty(window, name, {
        configurable: true,
        value: function ForbiddenRadioRuntime() {
          calls.push(name);
          throw new Error(`Forbidden fixture runtime: ${name}`);
        },
      });
    Storage.prototype.setItem = () => {
      calls.push("storage");
      throw new Error("Forbidden fixture storage");
    };
    HTMLMediaElement.prototype.play = () => {
      calls.push("playback");
      throw new Error("Forbidden fixture playback");
    };
  });
  await page.goto("/?view=scenes&scene=radio");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  const room = page.locator("[data-radio-shell]");
  await room.getByRole("button", { name: "Play", exact: true }).click();
  await room.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page
    .getByText("Playing Midnight on the harbour. No audio is loaded.", {
      exact: true,
    })
    .waitFor();
  await room.getByRole("button", { name: "Pause", exact: true }).click();
  const position = room.getByLabel("Track position", { exact: true });
  await position.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(Number(await position.inputValue()) > 42, true);
  await room.getByLabel("Volume", { exact: true }).focus();
  await page.keyboard.press("End");
  assert.equal(
    await room.getByLabel("Volume", { exact: true }).inputValue(),
    "1",
  );
  await room
    .getByRole("button", { name: "Play 10 milliseconds earlier", exact: true })
    .click();
  await room
    .getByLabel("Playback offset: 10 milliseconds earlier", { exact: true })
    .waitFor();

  const firstHandle = room.getByRole("button", {
    name: "Reorder Midnight on the harbour",
    exact: true,
  });
  await firstHandle.focus();
  await page.keyboard.press("ArrowDown");
  assert.match(
    await room
      .getByRole("list", { name: "Queue", exact: true })
      .locator(":scope > li")
      .first()
      .innerText(),
    /A small room/,
  );
  assert.equal(
    await firstHandle.evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Home");
  assert.match(
    await room
      .getByRole("list", { name: "Queue", exact: true })
      .locator(":scope > li")
      .first()
      .innerText(),
    /Midnight/,
  );
  const trackActions = room.getByLabel("Actions for Tape loop no. 4", {
    exact: true,
  });
  await trackActions.click();
  await room.getByRole("button", { name: "queue next", exact: true }).click();
  assert.match(
    await room
      .getByRole("list", { name: "Queue", exact: true })
      .locator(":scope > li")
      .nth(1)
      .innerText(),
    /Tape loop/,
  );
  assert.equal(
    await trackActions.evaluate((node) => node === document.activeElement),
    true,
  );

  await room
    .getByLabel("Actions for Midnight on the harbour", { exact: true })
    .click();
  await room
    .getByRole("button", { name: "rename", exact: true })
    .first()
    .click();
  const rename = room.getByLabel("Rename Midnight on the harbour", {
    exact: true,
  });
  await rename.fill("Harbour after midnight");
  await rename.press("Enter");
  await room
    .getByLabel("Reorder Harbour after midnight", { exact: true })
    .waitFor();
  assert.equal(
    await room
      .getByRole("button", { name: /01 Harbour after midnight/ })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await room
    .getByLabel("Actions for Harbour after midnight", { exact: true })
    .click();
  await room
    .getByRole("button", { name: "rename", exact: true })
    .first()
    .click();
  const cancel = room.getByLabel("Rename Harbour after midnight", {
    exact: true,
  });
  await cancel.fill("Do not commit");
  await cancel.press("Escape");
  assert.equal(
    await room
      .getByLabel("Reorder Harbour after midnight", { exact: true })
      .count(),
    1,
  );
  await room
    .getByLabel("Actions for Harbour after midnight", { exact: true })
    .click();
  await room
    .getByRole("button", { name: "delete", exact: true })
    .first()
    .click();
  assert.equal(
    await room
      .getByLabel("Reorder Harbour after midnight", { exact: true })
      .count(),
    0,
  );
  assert.equal(
    await room
      .getByRole("button", { name: /01 Tape loop/ })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await room
    .getByRole("button", { name: "Add synthetic track", exact: true })
    .click();
  await page
    .getByText("Synthetic track added. No file selected or uploaded.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await room.locator('input[type="file"]').count(), 0);
  assert.deepEqual(requests, []);
  assert.deepEqual(
    await page.evaluate(
      () =>
        (window as typeof window & { radioRuntimeCalls: string[] })
          .radioRuntimeCalls,
    ),
    [],
  );
  assert.deepEqual(errors, []);
});

it("renders actual Radio scenario states and narrow layouts", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await t.serve(await createTestServer(app.fetch));
  await page.goto("/?view=scenes&scene=radio");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiReady === "true",
  );
  const scenario = page.getByRole("button", { name: "Scenario", exact: true });
  const room = page.locator("[data-radio-shell]");
  await scenario.click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "listbox",
  );
  await page.getByRole("option", { name: "Empty", exact: true }).click();
  await room
    .getByRole("button", { name: "Play", exact: true })
    .and(room.locator("button:disabled"))
    .waitFor();
  assert.equal(
    await room.getByRole("button", { name: "Play", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await room
      .getByRole("list", { name: "Queue", exact: true })
      .locator(":scope > li")
      .count(),
    0,
  );
  await scenario.click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "listbox",
  );
  await page.getByRole("option", { name: "Offline", exact: true }).click();
  await room
    .getByRole("button", { name: "Sync playback", exact: true })
    .and(room.locator("button:disabled"))
    .waitFor();
  assert.equal(
    await room
      .getByRole("button", { name: "Sync playback", exact: true })
      .isDisabled(),
    true,
  );
  await scenario.click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "listbox",
  );
  await page.getByRole("option", { name: "Uploading", exact: true }).click();
  await room
    .locator('[data-upload-status="uploading"]')
    .getByText("↑ 31%", { exact: true })
    .waitFor();
  await scenario.click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "listbox",
  );
  await page.getByRole("option", { name: "Failed", exact: true }).click();
  await room
    .locator('[data-upload-status="failed"]')
    .getByText("failed", { exact: true })
    .waitFor();
  await scenario.click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "listbox",
  );
  await page.getByRole("option", { name: "Buffering", exact: true }).click();
  await room.getByText("1/4 ready", { exact: true }).waitFor();
  await scenario.click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "listbox",
  );
  await page.getByRole("option", { name: "Offset +20ms", exact: true }).click();
  await room
    .getByLabel("Playback offset: 20 milliseconds later", { exact: true })
    .waitFor();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  assert.equal(
    (
      await page.request.get(
        new URL("/assets/ui/radio/material-symbols-rounded.woff2", page.url())
          .href,
      )
    ).status(),
    200,
  );
});
