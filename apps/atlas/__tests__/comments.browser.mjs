import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";
const { chromium } = await import(process.env.HARRHY_ATLAS_PLAYWRIGHT ?? "@playwright/test");
const root = await mkdtemp(path.join(tmpdir(), "atlas-real-browser-"));
await mkdir(path.join(root, "alpha"));
await mkdir(path.join(root, "state"), { mode: 0o700 });
await writeFile(
  path.join(root, "alpha", "note.md"),
  `---\ntitle: A real article\npath: /note/\n---\nBefore 🦊 **quote** after.\n\nSecond paragraph with a useful explanation.\n\n# Repeated heading\n\n## Repeated heading\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\n[[widget:${"a".repeat(65)}]]`,
);
await writeFile(
  path.join(root, "atlas.json"),
  JSON.stringify({ spaces: [{ id: "alpha", name: "Alpha", directory: "alpha" }] }),
);
await writeFile(path.join(root, "credential"), "s".repeat(64), { mode: 0o600 });
await writeFile(
  path.join(root, "comments.json"),
  JSON.stringify({
    trust: "tailnet-owner-temporary",
    articleOrigin: "https://atlas.example",
    stateDirectory: path.join(root, "state"),
    bridgeEndpoint: "http://127.0.0.1:1",
    credentialFile: path.join(root, "credential"),
    defaultTargetKey: "a".repeat(64),
  }),
  { mode: 0o600 },
);
const originalFetch = globalThis.fetch;
const published = [];
const target = {
  key: "a".repeat(64),
  revision: 1,
  sessionId: "root-default",
  label: "Synthetic target",
  glyph: { paths: [{ fill: "#123456", d: "M0 0H1V1H0Z" }] },
};
let loseAcknowledgement = false;
let receiptMissing = true;
let failHistoricalReceipt = false;
const receiptChecks = [];
let holdReceipt = false,
  releaseReceipt;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.origin, "http://127.0.0.1:1", "fixture must not contact real services");
  if (url.pathname.endsWith("/targets"))
    return Response.json({
      targets: [
        target,
        {
          ...target,
          key: "b".repeat(64),
          sessionId: "root-other",
          label: "Other actual root title",
        },
      ],
      defaultSessionId: "root-default",
      eligibleCount: 2,
      omittedPrivacyCount: 0,
      unavailable: [],
    });
  if (url.pathname.endsWith("/batches")) {
    const body = JSON.parse(init.body);
    published.push(body);
    if (loseAcknowledgement) {
      loseAcknowledgement = false;
      throw new Error("Synthetic lost acknowledgement");
    }
    return Response.json({
      batchId: body.batchId,
      payloadDigest: body.payloadDigest,
      binding: body.target,
      receipt: { state: "admitted" },
      chatUrl: "https://pi.jackharrhy.dev/s/original-root/c/1",
    });
  }
  const batch = published.find((body) => body.batchId === url.searchParams.get("batchId"));
  assert.ok(batch);
  receiptChecks.push(batch.batchId);
  if (holdReceipt && batch.batchId === published.at(-1).batchId)
    await new Promise((resolve) => {
      releaseReceipt = resolve;
    });
  if (failHistoricalReceipt && batch.batchId === published[0].batchId)
    throw new Error("Synthetic historical receipt outage");
  return Response.json({
    batchId: batch.batchId,
    binding: batch.target,
    receipt: { state: receiptMissing ? "missing" : "admitted" },
    chatUrl: "https://pi.jackharrhy.dev/s/original-root/c/1",
  });
};
let atlas = await createAtlas(
  root,
  path.join(root, "atlas.json"),
  undefined,
  path.join(root, "comments.json"),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
const errors = [];
let acceptRetry = false;
page.on("dialog", (dialog) => {
  void (acceptRetry ? dialog.accept() : dialog.dismiss());
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("console", m.text());
});
await page.route("https://atlas.example/**", async (route) => {
  const r = route.request();
  const response = await atlas.router.fetch(
    new Request(r.url(), {
      method: r.method(),
      headers: r.headers(),
      ...(r.method() === "GET" ? {} : { body: r.postData() }),
    }),
  );
  if (failHistoricalReceipt && new URL(r.url()).pathname.endsWith("/comments/state")) {
    const state = await response.json();
    delete state.batches[0].chatUrl;
    await route.fulfill({ json: state });
    return;
  }
  await route.fulfill({
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: Buffer.from(await response.arrayBuffer()),
  });
});
function selectExample(options = {}) {
  const root = document.querySelector("[data-atlas-article]");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const text = nodes.map((node) => node.data).join("");
  const start = text.indexOf("🦊 quote"),
    end = start + "🦊 quote".length;
  if (start < 0) throw new Error("Fixture quote missing");
  const range = document.createRange();
  let offset = 0,
    began = false;
  for (const node of nodes) {
    const next = offset + node.length;
    if (!began && start <= next) {
      range.setStart(node, start - offset);
      began = true;
    }
    if (began && end <= next) {
      range.setEnd(node, end - offset);
      break;
    }
    offset = next;
  }
  if (options.coordinatesOnly) {
    const rects = [...range.getClientRects()].filter((rect) => rect.width && rect.height);
    const first = rects[0],
      last = rects[rects.length - 1];
    return {
      start: { x: first.left + 1, y: first.top + first.height / 2 },
      end: { x: last.right - 1, y: last.top + last.height / 2 },
    };
  }
  const pointerType = options.pointerType ?? "touch";
  root.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType }));
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  root.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType }));
}
try {
  await page.goto("https://atlas.example/spaces/alpha/note/");
  const commentToggle = page.getByRole("button", { name: "Comments", exact: true });
  await commentToggle.waitFor();
  assert.equal((await commentToggle.innerText()).trim(), "", "comment control is icon-only");
  assert.equal(await commentToggle.getAttribute("title"), "Comments");
  const toggleBox = await commentToggle.boundingBox();
  const gearBox = await page.getByRole("button", { name: "Settings", exact: true }).boundingBox();
  assert.equal(toggleBox.width, gearBox.width);
  assert.equal(toggleBox.height, gearBox.height);
  assert.ok(Math.abs(toggleBox.y - gearBox.y) < 1, "header icon buttons align");
  await commentToggle.focus();
  await commentToggle.press("Enter");
  assert.equal(await commentToggle.getAttribute("aria-pressed"), "true");
  await page.waitForTimeout(300);

  // Every actual title/heading is eligible; opening and cancelling never stages or sends.
  for (const selector of ["h1", "[data-atlas-markdown] h1", "h2", "h3", "h4", "h5", "h6"]) {
    await page.evaluate((selector) => {
      const root = document.querySelector("[data-atlas-article]");
      const heading = root.querySelector(selector);
      const range = document.createRange();
      range.selectNodeContents(heading);
      root.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      root.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }));
    }, selector);
    await page.getByRole("button", { name: "Comment on selection", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Comment", exact: true });
    await editor.waitFor({ state: "visible" });
    assert.equal(await editor.inputValue(), "");
    await editor.press("Escape");
  }
  assert.equal(
    (await (await atlas.router.fetch("https://atlas.example/_atlas/comments/state")).json())
      .comments.length,
    0,
  );
  assert.equal(published.length, 0);
  await page.evaluate(selectExample);
  await page.getByRole("button", { name: "Comment on selection", exact: true }).waitFor();
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    document
      .querySelector("[data-atlas-article]")
      .dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch" }));
    getSelection().removeAllRanges();
    await new Promise(requestAnimationFrame);
  });
  assert.equal(
    await page.getByRole("textbox", { name: "Comment", exact: true }).count(),
    0,
    "touch selection and cancellation must not steal focus",
  );
  await page.getByRole("button", { name: "Comment on selection", exact: true }).tap();
  await page.getByRole("textbox", { name: "Comment", exact: true }).waitFor({ state: "visible" });
  await page.evaluate(() => {
    const field = document.querySelector('textarea[aria-label="Comment"]');
    field.focus();
    getSelection().removeAllRanges();
    field.dispatchEvent(new FocusEvent("blur", { relatedTarget: null }));
    document.dispatchEvent(new PointerEvent("pointercancel", { pointerType: "touch" }));
    window.visualViewport?.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(180);
  await page
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Explain the fox example.");
  await page.screenshot({ path: "/tmp/atlas-real-editor-desktop.png" });
  await page.getByRole("textbox", { name: "Comment", exact: true }).press("Enter");
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
  );
  assert.equal(
    await page.getByRole("button", { name: "Comments", exact: true }).isVisible(),
    true,
    "a back-forward cache transition preserves the mounted comment controls",
  );
  await page.locator("[data-atlas-comment-fragment]").first().waitFor();
  await page.evaluate(() => {
    document
      .querySelector("[data-atlas-comment-fragment]")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.querySelector('button[aria-label="Comments"]').click();
  });
  await page.waitForTimeout(200);
  assert.equal(
    await page.getByRole("textbox", { name: "Comment", exact: true }).isVisible(),
    false,
    "queued editor cannot reopen after mode dismissal",
  );
  assert.equal(await commentToggle.getAttribute("aria-pressed"), "false");
  await commentToggle.click();
  // Mode off keeps marks inert; explicit reactivation preserves unrelated native selections.
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.locator("[data-atlas-comment-fragment]").first().click();
  assert.equal(
    await page.getByRole("textbox", { name: "Comment", exact: true }).isVisible(),
    false,
    "mode off keeps saved marks inert",
  );
  assert.equal(await page.getByRole("button", { name: "Review", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.evaluate(() => {
    const outside = document.querySelector("h1");
    const range = document.createRange();
    range.selectNodeContents(outside);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    document.addEventListener("mousedown", (event) => event.preventDefault(), { once: true });
    document.addEventListener(
      "click",
      () => {
        window.retainedOutsideSelection = !getSelection().isCollapsed;
      },
      { capture: true, once: true },
    );
  });
  await page.locator("[data-atlas-comment-fragment]").first().click();
  const reopened = page.getByRole("textbox", { name: "Comment", exact: true });
  await reopened.waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => window.retainedOutsideSelection), true);
  assert.equal(await reopened.inputValue(), "Explain the fox example.");
  await reopened.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Comments", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
    "Escape returns focus to a visible control, not a hidden review/tray node",
  );
  await page.evaluate(() => {
    const mark = document.querySelector("[data-atlas-comment-fragment]");
    mark.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    mark.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch" }));
    mark.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
  assert.equal(
    await reopened.isVisible(),
    false,
    "canceled selection gesture never activates a saved mark",
  );
  await page.evaluate(() => {
    const mark = document.querySelector("[data-atlas-comment-fragment]");
    mark.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
  });
  await page.evaluate(selectExample);
  await page.evaluate(() =>
    document
      .querySelector("[data-atlas-comment-fragment]")
      .dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })),
  );
  assert.equal(await reopened.isVisible(), false, "selection gesture does not open an editor");
  await page.getByRole("button", { name: "Comment on selection", exact: true }).tap();
  await reopened.waitFor({ state: "visible" });
  await reopened.press("Escape");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByText("Explain the fox example.", { exact: true }).waitFor();
  assert.equal(
    (await (await atlas.router.fetch("https://atlas.example/_atlas/comments/state")).json()).batches
      .length,
    0,
  );
  await page.screenshot({ path: "/tmp/atlas-real-review-desktop.png" });
  await page.reload();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByText("Explain the fox example.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto("https://atlas.example/spaces/alpha/");
  assert.equal(
    await page.getByRole("button", { name: "Review", exact: true }).count(),
    0,
    "closing stays dismissed across navigation",
  );
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByText("Explain the fox example.", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/atlas-real-review-mobile.png" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(published.length, 0, "selection, save, reload and navigation never publish");
  assert.equal(await page.getByRole("checkbox").count(), 0, "the whole round sends together");
  const recipient = page.getByRole("combobox", { name: "Send to", exact: true });
  assert.equal(await recipient.inputValue(), "root-default");
  assert.equal(await recipient.locator("option:not([disabled])").count(), 3);
  await recipient.selectOption("root-other");
  assert.equal(await recipient.inputValue(), "root-other");
  await commentToggle.click();
  assert.equal(
    await page.locator(".atlas-comment-review").isVisible(),
    false,
    "mode off closes the review panel",
  );
  assert.equal(await page.getByRole("button", { name: "Review", exact: true }).count(), 0);
  await commentToggle.click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  assert.equal(
    await recipient.inputValue(),
    "root-other",
    "reactivation preserves unfinished round recipient",
  );

  await page.goto("https://atlas.example/spaces/alpha/note/");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await recipient.locator("option[value=root-other]").waitFor({ state: "attached" });
  assert.equal(
    await recipient.inputValue(),
    "root-other",
    "whole-round destination survives page navigation",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  if (
    (await page
      .getByRole("button", { name: "Comments", exact: true })
      .getAttribute("aria-pressed")) !== "true"
  )
    await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.evaluate(() => {
    const root = document.querySelector("[data-atlas-article]");
    const range = document.createRange();
    range.selectNodeContents(root.querySelector("h1"));
    root.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    root.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }));
  });
  await page.getByRole("button", { name: "Comment on selection", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Second comment in the same round.");
  await page.getByRole("textbox", { name: "Comment", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  assert.equal(await recipient.inputValue(), "root-other");
  target.key = "c".repeat(64);
  target.revision = 2;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(
    await recipient.inputValue(),
    "root-other",
    "binding refresh preserves selected session",
  );
  await recipient.selectOption("root-default");
  loseAcknowledgement = true;
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
  assert.equal(published.length, 1);
  assert.deepEqual(published[0].target, { key: "c".repeat(64), revision: 2 });
  assert.equal(
    published[0].comments.length,
    2,
    "all saved comments send together without selection",
  );
  assert.equal(
    await page.getByRole("link", { name: "Open in Pi", exact: true }).count(),
    0,
    "uncertain ACK cannot claim a chat link",
  );
  assert.equal(
    await page.getByRole("button", { name: "Send", exact: true }).count(),
    0,
    "uncertain round cannot create another batch",
  );
  target.key = "d".repeat(64);
  target.revision = 3;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const chat = page.getByRole("link", { name: "Open in Pi", exact: true });
  await chat.waitFor();
  assert.equal(await chat.getAttribute("href"), "https://pi.jackharrhy.dev/s/original-root/c/1");
  assert.equal(published.length, 2, "missing original receipt retries only the frozen batch");
  assert.deepEqual(published[0], published[1], "main changes never retarget the original retry");
  receiptMissing = false;
  assert.equal(
    await page
      .locator(".atlas-comment-review")
      .getByText(/Original target|immutable|revision|Check receipt|Retry original/)
      .count(),
    0,
  );
  assert.equal(await page.getByRole("checkbox").count(), 0);
  for (const name of ["Refresh", "Close"]) {
    const button = page.getByRole("button", { name, exact: true });
    assert.equal((await button.innerText()).trim(), "", "review header controls are icon-only");
    assert.equal(await button.getAttribute("title"), name);
  }
  await page.waitForFunction(
    () => !document.querySelector(".atlas-comment-review button").disabled,
  );
  await page.screenshot({ path: "/tmp/atlas-polish-sent-390.png" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Review", exact: true }).count(),
    0,
    "closing Sent dismisses the round affordance",
  );
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Review", exact: true }).count(),
    0,
    "new mode never resurrects historical Sent",
  );
  for (const theme of ["clean", "tactile", "brutalist"]) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`https://atlas.example/spaces/alpha/note/?theme=${theme}`);
      await page.waitForTimeout(300);
      if (
        (await page
          .getByRole("button", { name: "Comments", exact: true })
          .getAttribute("aria-pressed")) !== "true"
      )
        await page.getByRole("button", { name: "Comments", exact: true }).click();
      const points = await page.evaluate(selectExample, { coordinatesOnly: true });
      await page.mouse.move(points.start.x, points.start.y);
      await page.mouse.down();
      await page.mouse.move(points.end.x, points.end.y, { steps: 8 });
      if (theme === "clean" && width === 1440) {
        await page.waitForTimeout(600);
        assert.equal(
          await page.getByRole("textbox", { name: "Comment", exact: true }).isVisible(),
          false,
          "mouse selection stays native until release, even during a long drag",
        );
      }
      await page.mouse.up();
      const field = page.getByRole("textbox", { name: "Comment", exact: true });
      await field.waitFor({ state: "visible" });
      assert.equal(
        await page.getByRole("button", { name: "Comment on selection", exact: true }).count(),
        0,
        "mouse selection auto-opens with no required second action, even at narrow widths",
      );
      const anchored = await field.boundingBox();
      assert.ok(anchored.y < 450, "mouse editor stays anchored, not viewport docked");
      await field.fill("A retained draft");
      await field.press("Shift+Enter");
      await field.press("x");
      assert.equal(await field.inputValue(), "A retained draft\nx");
      const box = await field.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.ok(box.width <= 352 && box.height >= 88);
      await page.screenshot({ path: `/tmp/atlas-real-${theme}-${width}-editor.png` });
      await field.press("Enter");
      await page.getByRole("button", { name: "Review", exact: true }).click();
      await page.getByRole("button", { name: "Refresh", exact: true }).waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".atlas-comment-review button").disabled,
      );
      await page.screenshot({ path: `/tmp/atlas-compact-${theme}-${width}-review.png` });
      const typography = await page.locator(".atlas-comment-review").evaluate((node) => ({
        body: getComputedStyle(node).fontFamily,
        heading: getComputedStyle(node.querySelector("h2")).fontFamily,
      }));
      assert.equal(
        typography.body,
        typography.heading,
        "review heading uses UI typography, not article serif",
      );
      assert.equal(
        await page.getByText(/available agents|omitted for privacy|Nothing sent/).count(),
        0,
      );
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page
        .getByRole("button", { name: "Refresh", exact: true })
        .waitFor({ state: "visible" });
      await page.waitForFunction(
        () => !document.querySelector(".atlas-comment-review button").disabled,
      );
      await page.getByRole("button", { name: "Close", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Review", exact: true }).count(), 0);
      assert.equal(
        (await (await atlas.router.fetch("https://atlas.example/_atlas/comments/state")).json())
          .comments.length,
        2,
        "theme draft removed without changing sent history",
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  if (
    (await page
      .getByRole("button", { name: "Comments", exact: true })
      .getAttribute("aria-pressed")) !== "true"
  )
    await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.evaluate(selectExample);
  assert.equal(
    await page.getByRole("textbox", { name: "Comment", exact: true }).isVisible(),
    false,
    "touch handles never auto-open the keyboard",
  );
  await page.getByRole("button", { name: "Comment on selection", exact: true }).tap();
  const touchField = page.getByRole("textbox", { name: "Comment", exact: true });
  await touchField.waitFor({ state: "visible" });
  await page.screenshot({ path: "/tmp/atlas-real-touch-390-editor.png" });
  const dock = await touchField.boundingBox();
  assert.ok(Math.abs(dock.y + dock.height - 888) < 3, "touch editor docked above viewport bottom");
  await page.setViewportSize({ width: 390, height: 360 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: "/tmp/atlas-real-touch-keyboard-editor.png" });
  const keyboardDock = await touchField.boundingBox();
  assert.ok(keyboardDock.y >= 0 && keyboardDock.y + keyboardDock.height <= 348.5);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(100);
  const rotated = await touchField.boundingBox();
  assert.ok(
    Math.abs(rotated.y + rotated.height - 378) < 3,
    "touch presentation remains docked after rotation",
  );
  await touchField.press("Escape");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const nativePoints = await page.evaluate(selectExample, { coordinatesOnly: true });
  await page.mouse.move(nativePoints.start.x, nativePoints.start.y);
  await page.mouse.down();
  await page.mouse.move(nativePoints.end.x, nativePoints.end.y, { steps: 8 });
  await page.mouse.up();
  assert.equal(
    await touchField.isVisible(),
    false,
    "mode off preserves native selection without opening an editor",
  );
  assert.ok(await page.evaluate(() => getSelection().toString().length > 0));
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  assert.equal(published.length, 2, "theme/reload/escape never publish");
  await page.evaluate(selectExample);
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForTimeout(200);
  assert.equal(
    await touchField.isVisible(),
    false,
    "keyboard selection does not steal focus during a pause",
  );
  await page.keyboard.press("Alt+Enter");
  await touchField.waitFor({ state: "visible" });
  await touchField.press("Escape");
  await page.evaluate(selectExample);
  await page.getByRole("button", { name: "Comment on selection", exact: true }).tap();
  const retained = page.getByRole("textbox", { name: "Comment", exact: true });
  await retained.waitFor({ state: "visible" });
  await retained.fill("Retained across server restart");
  acceptRetry = true;
  await page.reload();
  acceptRetry = false;
  await retained.waitFor({ state: "visible" });
  assert.equal(
    await retained.inputValue(),
    "Retained across server restart",
    "unsaved tab draft recovers without publishing after reload",
  );
  atlas.close();
  atlas = await createAtlas(
    root,
    path.join(root, "atlas.json"),
    undefined,
    path.join(root, "comments.json"),
  );
  await retained.press("Enter");
  await retained.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByText("Retained across server restart", { exact: true }).waitFor();
  assert.equal(published.length, 2, "restart/CSRF recovery never publishes");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await retained.waitFor({ state: "visible" });
  await retained.fill("Saved by leaving the editor");
  await page.getByRole("button", { name: "Comments", exact: true }).focus();
  await retained.waitFor({ state: "hidden" });
  const afterBlur = await (
    await atlas.router.fetch("https://atlas.example/_atlas/comments/state")
  ).json();
  assert.ok(
    afterBlur.comments.some(
      (comment) => comment.evidence.comment === "Saved by leaving the editor",
    ),
  );
  assert.equal(afterBlur.batches.length, 1);
  assert.equal(
    afterBlur.batches[0].comments[0].comment,
    "Explain the fox example.",
    "private edits never mutate the original batch",
  );
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await retained.waitFor({ state: "visible" });
  await retained.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Comments", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
    "Review edit returns focus to a visible control after cancellation",
  );
  assert.equal(published.length, 2, "true blur, Review edit and Escape never publish");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  assert.equal(
    await recipient.inputValue(),
    "root-default",
    "a new round restores the external default",
  );
  loseAcknowledgement = true;
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
  assert.equal(published.length, 3);
  failHistoricalReceipt = true;
  receiptChecks.length = 0;
  holdReceipt = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  for (let i = 0; !releaseReceipt && i < 100; i++) await page.waitForTimeout(20);
  assert.equal(typeof releaseReceipt, "function");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Review", exact: true }).count(), 0);
  releaseReceipt();
  await page.waitForFunction(
    () => !document.querySelector(".atlas-comment-review button").disabled,
  );
  assert.equal(
    await page.locator(".atlas-comment-review").isVisible(),
    false,
    "late receipt cannot reopen dismissed panel",
  );
  assert.equal(
    await page.getByRole("button", { name: "Review", exact: true }).count(),
    0,
    "late receipt cannot restore dismissed affordance",
  );
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Review", exact: true }).count(),
    0,
    "reactivation does not show admitted history",
  );
  assert.ok(receiptChecks.includes(published[0].batchId), "historical receipt was attempted");
  assert.ok(
    receiptChecks.includes(published[2].batchId),
    "historical outage cannot block current admission",
  );
  assert.equal(published.length, 3, "admitted readback after lost ACK never republishes");
  assert.deepEqual(errors, []);
  console.log(
    "PASS real SSR/bundle/selection/save/reload/cross-route review/no publication/mobile overflow",
    errors,
  );
} finally {
  await browser.close();
  atlas.close();
  globalThis.fetch = originalFetch;
  await rm(root, { recursive: true, force: true });
}
