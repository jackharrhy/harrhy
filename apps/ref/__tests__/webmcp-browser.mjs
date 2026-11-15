import assert from "node:assert/strict";

export async function installWebMcpTestHost(page) {
  await page.addInitScript(() => {
    const tools = new Map();
    window.refTestBrowserTools = tools;
    Object.defineProperty(document, "modelContext", {
      value: {
        async registerTool(tool, { signal }) {
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
  });
}

export async function checkWebMcpBrowser(page, second, itemId) {
  assert.equal(await page.evaluate(() => window.refTestBrowserTools.size), 0);
  await page.getByText("Browser tools", { exact: true }).click();
  await page.locator("#webmcp-toggle").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#webmcp-status")
      .textContent.startsWith("On for this page"),
  );
  assert.equal(await page.evaluate(() => window.refTestBrowserTools.size), 6);
  await page.waitForFunction(async () => {
    const tool = window.refTestBrowserTools.get("ref_board_context");
    const state = await tool.execute(
      { offset: 0 },
      { signal: new AbortController().signal },
    );
    return state.pendingEdits === 0;
  });
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
  await page.waitForFunction(
    async () =>
      (
        await window.refTestBrowserTools
          .get("ref_board_context")
          .execute({ offset: 0 }, { signal: new AbortController().signal })
      ).pendingEdits === 0,
  );
  const disabledPending = await page.evaluate(async () => {
    const signal = new AbortController().signal;
    const state = await window.refTestBrowserTools
      .get("ref_board_context")
      .execute({ offset: 0 }, { signal });
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
    document.querySelector("#webmcp-toggle").click();
    try {
      await result;
      return false;
    } catch (error) {
      return error.message.includes("cannot undo");
    }
  });
  assert.equal(disabledPending, true);
  await page.locator("#webmcp-toggle").click();
  await page.waitForFunction(
    async () =>
      (
        await window.refTestBrowserTools
          .get("ref_board_context")
          .execute({ offset: 0 }, { signal: new AbortController().signal })
      ).pendingEdits === 0,
  );
  await page.evaluate(() => {
    window.refTestStaleTool = window.refTestBrowserTools.get("ref_board_fit");
  });
  await page.locator("#webmcp-toggle").click();
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
  assert.equal(
    await page.locator("#webmcp-toggle").getAttribute("aria-pressed"),
    "false",
  );
  await page.evaluate(() => {
    window.refTestWebMcpFail = true;
  });
  await page.locator("#webmcp-toggle").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#webmcp-status")
      .textContent.startsWith("Browser tools could not start"),
  );
  assert.equal(await page.evaluate(() => window.refTestBrowserTools.size), 0);
  await page.evaluate(() => {
    window.refTestWebMcpFail = false;
  });
  await page.locator("#webmcp-toggle").click();
  await page.waitForFunction(() => window.refTestBrowserTools.size === 6);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  assert.equal(await page.evaluate(() => window.refTestBrowserTools.size), 0);
  assert.equal(
    await page.locator("#webmcp-toggle").getAttribute("aria-pressed"),
    "false",
  );
  await page.getByText("Browser tools", { exact: true }).click();

  await second.getByText("Browser tools", { exact: true }).click();
  await second.locator("#webmcp-toggle").click();
  assert.match(
    await second.locator("#webmcp-status").textContent(),
    /does not support WebMCP/,
  );
  await second.getByText("Browser tools", { exact: true }).click();
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
  await page.getByText("Browser tools", { exact: true }).click();
  await page.locator("#webmcp-toggle").click();
  await page.waitForFunction(() => window.refTestBrowserTools.size === 6);
  const result = await page.evaluate(async (id) => {
    const signal = new AbortController().signal;
    const state = await window.refTestBrowserTools
      .get("ref_board_context")
      .execute({ offset: 0 }, { signal });
    const item = state.items.find((entry) => entry.id === id);
    const operation = {
      operationId: crypto.randomUUID(),
      itemId: id,
      baseRevision: item.revision,
    };
    const tool = window.refTestBrowserTools.get("ref_item_remove");
    const applied = await tool.execute(operation, { signal });
    const replay = await tool.execute(operation, { signal });
    return { applied, replay };
  }, itemId);
  assert.equal(result.applied.status, "applied");
  assert.equal(result.applied.item, null);
  assert.equal(result.replay.sequence, result.applied.sequence);
  await second
    .locator(`[data-item-id="${itemId}"]`)
    .waitFor({ state: "detached" });
  await page.locator("#webmcp-toggle").click();
  await page.getByText("Browser tools", { exact: true }).click();
}
