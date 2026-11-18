import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function installWebMcpTestHost(page, fail = false) {
  await page.addInitScript((registrationFails) => {
    window.refTestWebMcpFail = registrationFails;
    window.refTestRegistrationAttempts = 0;
    const tools = new Map();
    window.refTestBrowserTools = tools;
    Object.defineProperty(document, "modelContext", {
      value: {
        async registerTool(tool, { signal }) {
          window.refTestRegistrationAttempts++;
          if (signal.aborted) throw signal.reason;
          if (window.refTestWebMcpFail)
            throw new Error("Synthetic registration failure");
          tools.set(tool.name, tool);
          signal.addEventListener(
            "abort",
            () => {
              if (tools.get(tool.name) === tool) tools.delete(tool.name);
            },
            { once: true },
          );
        },
      },
    });
  }, fail);
}

async function waitForSettled(page) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const state = await window.refTestBrowserTools
          .get("ref_board_context")
          .execute({ offset: 0 }, { signal: new AbortController().signal });
        return (
          state.live && state.pendingEdits === 0 && state.interaction === null
        );
      }),
    )
    .toBe(true);
}

export async function checkWebMcpBrowser(page, second, itemId) {
  await page.waitForFunction(() => window.refTestBrowserTools.size === 6);
  assert.equal(
    await page.getByText("Browser tools", { exact: true }).count(),
    0,
  );
  await waitForSettled(page);
  const transformed = await page.evaluate(async (id) => {
    const signal = new AbortController().signal;
    const call = (name, input = {}) =>
      window.refTestBrowserTools.get(name).execute(input, { signal });
    const state = await call("ref_board_context", { offset: 0 });
    const item = state.items.find((entry) => entry.id === id);
    await call("ref_board_select", { itemId: null });
    await call("ref_board_focus", { itemId: id });
    await call("ref_board_select", { itemId: id });
    const selected = await call("ref_board_context", { offset: 0 });
    await call("ref_board_fit");
    const operation = {
      operationId: crypto.randomUUID(),
      itemId: id,
      baseRevision: item.revision,
      x: item.x + 16,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      z: item.z,
    };
    const applied = await call("ref_item_transform", operation);
    const replayed = await call("ref_item_transform", operation);
    let conflict = false;
    try {
      await call("ref_item_transform", {
        ...operation,
        operationId: crypto.randomUUID(),
      });
    } catch {
      conflict = true;
    }
    return {
      replaySequence: replayed.sequence,
      appliedSequence: applied.sequence,
      conflict,
      selected: selected.selectedItemId,
      status: applied.status,
      x: applied.item.x,
    };
  }, itemId);
  assert.equal(transformed.selected, itemId);
  assert.equal(transformed.status, "applied");
  assert.equal(transformed.replaySequence, transformed.appliedSequence);
  assert.equal(transformed.conflict, true);
  await second.waitForFunction(
    ({ id, x }) =>
      document.querySelector(`[data-item-id="${id}"]`)?.style.left === `${x}px`,
    { id: itemId, x: transformed.x },
  );
  const cancelled = await page.evaluate(async () => {
    const controller = new AbortController();
    const context = window.refTestBrowserTools.get("ref_board_context");
    const state = await context.execute(
      { offset: 0 },
      { signal: controller.signal },
    );
    const item = state.items[0];
    const result = window.refTestBrowserTools.get("ref_item_transform").execute(
      {
        operationId: crypto.randomUUID(),
        itemId: item.id,
        baseRevision: item.revision,
        x: item.x + 8,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        z: item.z,
      },
      { signal: controller.signal },
    );
    controller.abort();
    try {
      await result;
      return false;
    } catch (error) {
      return error.message.includes("cannot undo");
    }
  });
  assert.equal(cancelled, true);
  await waitForSettled(page);
  const pageExitPending = await page.evaluate(async () => {
    const signal = new AbortController().signal;
    const state = await window.refTestBrowserTools
      .get("ref_board_context")
      .execute({ offset: 0 }, { signal });
    if (!state.live || state.pendingEdits || state.interaction !== null)
      throw new Error(`Unexpected unsettled board: ${JSON.stringify(state)}`);
    const item = state.items[0];
    const result = window.refTestBrowserTools.get("ref_item_transform").execute(
      {
        operationId: crypto.randomUUID(),
        itemId: item.id,
        baseRevision: item.revision,
        x: item.x + 8,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        z: item.z,
      },
      { signal },
    );
    window.refTestStaleTool = window.refTestBrowserTools.get("ref_board_fit");
    window.dispatchEvent(new Event("pagehide"));
    try {
      await result;
      return false;
    } catch (error) {
      return error.message.includes("cannot undo");
    }
  });
  assert.equal(pageExitPending, true);
  assert.equal(await page.evaluate(() => window.refTestBrowserTools.size), 0);
  assert.equal(
    await page.evaluate(async () => {
      try {
        await window.refTestStaleTool.execute(
          {},
          { signal: new AbortController().signal },
        );
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await page.waitForFunction(() => window.refTestBrowserTools.size === 6);
  await waitForSettled(page);
  assert.equal(
    await second.locator("#webmcp-toggle, #webmcp-status").count(),
    0,
  );
  const failed = await page.context().newPage();
  await installWebMcpTestHost(failed, true);
  await failed.goto(page.url());
  await failed.locator("#connection.online").waitFor();
  await failed.waitForFunction(() => window.refTestRegistrationAttempts > 0);
  assert.equal(await failed.evaluate(() => window.refTestBrowserTools.size), 0);
  assert.equal(await failed.locator(".board-item").count(), 1);
  assert.equal(
    await failed.locator("#webmcp-toggle, #webmcp-status").count(),
    0,
  );
  await failed.close();
}

export async function checkWebMcpRemoval(page, second) {
  await page.locator("#link-menu summary").click();
  await page.locator("#link-url").fill("https://example.net/");
  await page.locator("#link-form button").click();
  await page.locator(".link-item").nth(2).waitFor({ timeout: 20_000 });
  await second.locator(".link-item").nth(2).waitFor();
  const itemId = await page
    .locator(".link-item")
    .nth(2)
    .getAttribute("data-item-id");
  await page.waitForFunction(() => window.refTestBrowserTools.size === 6);
  const result = await page.evaluate(async (id) => {
    const signal = new AbortController().signal;
    const state = await window.refTestBrowserTools
      .get("ref_board_context")
      .execute({ offset: 0 }, { signal });
    const item = state.items.find((entry) => entry.id === id);
    const originalTitle = item.link.title;
    item.link.title += " (modified by tool consumer)";
    const reread = await window.refTestBrowserTools
      .get("ref_board_context")
      .execute({ offset: 0 }, { signal });
    const isolated =
      reread.items.find((entry) => entry.id === id).link.title ===
      originalTitle;
    const operation = {
      operationId: crypto.randomUUID(),
      itemId: id,
      baseRevision: item.revision,
    };
    const tool = window.refTestBrowserTools.get("ref_item_remove");
    const applied = await tool.execute(operation, { signal });
    const replay = await tool.execute(operation, { signal });
    return { applied, replay, isolated };
  }, itemId);
  assert.equal(result.isolated, true);
  assert.equal(result.applied.status, "applied");
  assert.equal(result.applied.item, null);
  assert.equal(result.replay.sequence, result.applied.sequence);
  await second
    .locator(`[data-item-id="${itemId}"]`)
    .waitFor({ state: "detached" });
}
