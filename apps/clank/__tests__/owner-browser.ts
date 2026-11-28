import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as tlsServer } from "node:tls";
import { chromium } from "playwright";
const OWNER_HOST = "clank.example.test";
import { structuredAttribution } from "../owner/attribution.ts";

const quoted = `> <sender kind="external" id="synthetic" name="Quoted example"/>`;
assert.equal(structuredAttribution("legacy", quoted), undefined);
for (const kind of ["owner", "guest"] as const) {
  assert.equal(
    structuredAttribution("p2.input", {
      author: { kind, id: "synthetic", name: "Example person" },
      text: quoted,
      attachments: [],
    })?.kind,
    kind,
  );
}
for (const kind of [undefined, "external"]) {
  assert.equal(
    structuredAttribution("p2.peer-message", {
      from: { id: "synthetic", title: "Example peer", kind },
      text: "Example text",
    })?.kind,
    kind ?? "session",
  );
}

// Test-only TLS terminator. Chromium maps the canonical name to this listener, never to DNS.
const piRoot = process.env.HARRHY_CLANK_TEST_PI_ROOT
  ? new URL(`file://${process.env.HARRHY_CLANK_TEST_PI_ROOT}/`)
  : new URL("../../pi/", import.meta.url);
const { startFixture, TEST } = (await import(
  new URL("__tests__/p2/helpers.ts", piRoot).href
)) as typeof import("../../pi/__tests__/p2/helpers.ts");
const { Catalog } = (await import(
  new URL("plugins/sessions/contract.ts", piRoot).href
)) as typeof import("../../pi/plugins/sessions/contract.ts");
const { mintOwnerLink } = (await import(
  new URL("src/runtime/owner-link.ts", piRoot).href
)) as typeof import("../../pi/src/runtime/owner-link.ts");
const origin = `https://${OWNER_HOST}`;
const fixture = await startFixture({ allowedHosts: [OWNER_HOST], web: true });
const dir = await mkdtemp(join(tmpdir(), "clank-owner-e2e-"));
const sockets = new Set<ReturnType<typeof connect>>();
let browser, edge, child, restarted;
try {
  const session = await fixture.server.host.root(async (ctx) => {
    const catalog = await ctx.get(Catalog, {});
    const actualNow = Date.now;
    try {
      for (const [title, elapsed] of [
        ["Age minutes", 29 * 60_000],
        ["Age hours", 13 * 3_600_000],
        ["Age days", 2 * 86_400_000],
        ["Older A", 4 * 86_400_000],
        ["Older B", 5 * 86_400_000],
      ] as const) {
        const time = actualNow() - elapsed;
        Date.now = () => time;
        await catalog.create(
          {
            title,
            cwd: fixture.workspace,
            model: { provider: "faux", modelId: "faux-1" },
            thinkingLevel: "off",
          },
          ctx,
        );
      }
    } finally {
      Date.now = actualNow;
    }
    await catalog.create(
      {
        title: "Second session",
        cwd: fixture.workspace,
        model: { provider: "faux", modelId: "faux-1" },
        thinkingLevel: "off",
      },
      ctx,
    );
    return catalog.create(
      {
        title: "Disposable Clank session",
        cwd: fixture.workspace,
        model: { provider: "faux", modelId: "faux-1" },
        thinkingLevel: "off",
      },
      ctx,
    );
  }, TEST);
  const portProbe = createServer().listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const address = portProbe.address();
  assert(address && typeof address === "object");
  portProbe.close();
  await once(portProbe, "close");
  child = spawn(process.execPath, [".celld/owner/server.mjs"], {
    env: {
      ...process.env,
      HARRHY_CLANK_OWNER_ORIGIN: origin,
      HARRHY_CLANK_PORT: String(address.port),
      HARRHY_CLANK_PI_PORT: String(fixture.server.port),
      HARRHY_CLANK_FAMILIAR_SESSION_ID: session.id,
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(() => {
      throw Error("Clank failed to start");
    }),
  ]);
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      `/CN=${OWNER_HOST}`,
      "-keyout",
      join(dir, "key"),
      "-out",
      join(dir, "cert"),
    ],
    { stdio: "ignore" },
  );
  edge = tlsServer(
    {
      key: await readFile(join(dir, "key")),
      cert: await readFile(join(dir, "cert")),
    },
    (client) => {
      const peer = connect(address.port, "127.0.0.1");
      sockets.add(client);
      sockets.add(peer);
      client.on("error", () => peer.destroy());
      peer.on("error", () => client.destroy());
      client.on("close", () => {
        sockets.delete(client);
        peer.destroy();
      });
      peer.on("close", () => {
        sockets.delete(peer);
        client.destroy();
      });
      client.pipe(peer).pipe(client);
    },
  ).listen(0, "127.0.0.1");
  await once(edge, "listening");
  const edgeAddress = edge.address();
  assert(edgeAddress && typeof edgeAddress === "object");
  browser = await chromium.launch({
    args: [
      `--host-resolver-rules=MAP ${OWNER_HOST} 127.0.0.1:${edgeAddress.port}`,
      "--no-proxy-server",
    ],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 320, height: 640 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  const invite = await mintOwnerLink(
    new URL(`http://127.0.0.1:${fixture.server.port}`),
    fixture.dataDir,
    new URL(origin),
  );
  await page.getByLabel("One-time token").fill(invite.hash.slice(1));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const row = page.getByRole("button", { name: "Familiar", exact: true });
  const olderButton = page.getByRole("link", {
    name: "2 older",
    exact: true,
  });
  await olderButton.waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Older A", exact: true }).count(),
    0,
  );
  for (const [name, age] of [
    ["Age minutes", "29m"],
    ["Age hours", "13h"],
    ["Age days", "2d"],
  ]) {
    await page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name, exact: true }) })
      .getByText(age, { exact: true })
      .waitFor();
  }
  await olderButton.press("Enter");
  await page.waitForURL("**/list/other");
  const searchOlder = page.getByRole("searchbox", {
    name: "Search sessions and messages",
  });
  await searchOlder.waitFor();
  assert.equal(
    await searchOlder.evaluate((node) => node === document.activeElement),
    false,
  );
  await searchOlder.fill("Older A");
  const listRegion = page.getByRole("region", { name: "Session detail" });
  await listRegion
    .getByRole("button", { name: "Older B", exact: true })
    .waitFor({ state: "hidden" });
  if (process.env.HARRHY_CLANK_SCREENSHOT_DIR)
    await page.screenshot({
      path: join(
        process.env.HARRHY_CLANK_SCREENSHOT_DIR,
        "clank-older-search.png",
      ),
    });

  await page
    .getByRole("region", { name: "Session detail" })
    .getByRole("button", { name: "Older A", exact: true })
    .click();
  await page.getByRole("heading", { name: "Older A", exact: true }).waitFor();
  assert(new URL(page.url()).pathname.startsWith("/session/"));
  await page.goBack();
  await searchOlder.waitFor();
  assert.equal(await searchOlder.inputValue(), "Older A");
  await page.goBack();
  await row.waitFor();
  assert.equal(
    await page.getByRole("region", { name: "Session detail" }).isVisible(),
    false,
  );
  await row.press("Enter");
  await page
    .getByRole("heading", { name: session.title, exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("complementary", { name: "Session list" }).isVisible(),
    false,
  );
  await page.getByRole("button", { name: "Show sessions" }).click();
  assert(await row.evaluate((node) => node === document.activeElement));
  await row.click();
  const cookies = await context.cookies(origin);
  assert(
    cookies.some(
      (cookie) =>
        cookie.httpOnly && cookie.secure && cookie.domain === OWNER_HOST,
    ),
  );
  const observer = await context.newPage();
  observer.setDefaultTimeout(8000);
  await observer.setViewportSize({ width: 1440, height: 900 });
  await observer.goto(origin);
  await observer
    .getByRole("button", { name: "Second session", exact: true })
    .click();
  await observer
    .getByRole("heading", { name: "Second session", exact: true })
    .waitFor();
  await observer.getByRole("button", { name: "Familiar", exact: true }).click();
  await observer
    .getByRole("heading", { name: session.title, exact: true })
    .waitFor();
  assert.equal(
    await observer.getByRole("button", { name: "Show sessions" }).isVisible(),
    false,
  );
  const tools = page.getByRole("button", { name: "Session tools" });
  async function rename() {
    await tools.press("Enter");
    await page.getByRole("menuitem", { name: "Rename" }).press("Enter");
  }
  await rename();
  const input = page.getByRole("textbox", { name: "Session title" });
  assert.equal(
    await input.evaluate((node) => node === document.activeElement),
    true,
  );
  await input.press("Escape");
  assert.equal(
    await tools.evaluate((node) => node === document.activeElement),
    true,
  );
  await rename();
  await input.fill("   ");
  await input.press("Enter");
  await page.getByRole("alert").waitFor();
  const title = "Renamed through Clank";
  await input.fill(` ${title} `);
  await input.press("Enter");
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await observer.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(
    await fixture.server.host.root(
      async (ctx) =>
        (await (await ctx.get(Catalog, {})).get({ id: session.id }, ctx))
          ?.title,
      TEST,
    ),
    title,
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const message = page.getByRole("textbox", { name: "Message" });
  const prompt = "slow disposable selection proof";
  await message.fill(prompt);
  await message.press("Shift+Enter");
  assert.equal(await message.inputValue(), prompt + String.fromCharCode(10));
  await message.dispatchEvent("compositionstart");
  await message.press("Enter");
  assert((await message.inputValue()).startsWith(prompt));
  assert(
    await page.getByRole("button", { name: "Send", exact: true }).isEnabled(),
  );
  await message.dispatchEvent("compositionend");
  await message.press("Enter");
  await page.locator("[data-streaming]").filter({ hasText: "Echo:" }).waitFor();
  await observer
    .getByRole("button", { name: "Second session", exact: true })
    .click();
  await observer.getByText("No messages yet.").waitFor();
  assert.equal(
    await observer
      .getByLabel("Transcript")
      .getByText(prompt, { exact: true })
      .count(),
    0,
  );
  await observer
    .getByRole("complementary", { name: "Session list" })
    .getByRole("button", { name: "Familiar", exact: true })
    .click();
  await observer
    .getByLabel("Transcript")
    .getByText(prompt, { exact: true })
    .waitFor();
  await page.getByText(/^Echo: slow disposable selection proof/).waitFor();
  await page
    .locator("[data-streaming]")
    .waitFor({ state: "hidden", timeout: 15000 });
  await message.fill("steps");
  await message.press("Enter");
  const wheel = page
    .getByRole("button", { name: /Read a file.*Show the steps/i })
    .first();
  await wheel.waitFor({ timeout: 15000 });
  await page.getByText(/^Echo: steps/).waitFor({ timeout: 15000 });
  await wheel.press("ArrowUp");
  const face = page
    .getByRole("button", { name: /Read fixture.txt.*Show the steps/i })
    .first();
  await face.press("Enter");
  await page
    .locator("summary")
    .filter({ hasText: /^Read fixture.txt · (Done|Failed)$/ })
    .first()
    .waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await message.fill("slow-tool");
  await message.press("Enter");
  const running = page
    .locator("[data-tool-activity][data-state=working]")
    .getByRole("button", { name: /Running printf/ });
  await running.waitFor({ timeout: 10000 });
  assert.equal(
    await running
      .locator("span")
      .filter({ hasText: /Running printf/ })
      .last()
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  await page
    .getByRole("button", { name: /ran a command.*Show the steps/i })
    .waitFor({ timeout: 15000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const markdown = [
    "**Strong receipt** and [Pi docs](https://example.com/pi).",
    "[Unsafe destination](javascript:alert%281%29) and <img src=x onerror=alert(1)>.",
    "```text",
    "retained code fence",
    "```",
  ].join("\n\n");
  const transcript = page.getByLabel("Transcript");
  await message.fill(`json ${markdown}`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await transcript
    .locator("strong")
    .getByText("Strong receipt", { exact: true })
    .waitFor();
  assert.equal(
    await transcript
      .getByRole("link", { name: "Pi docs" })
      .getAttribute("href"),
    "https://example.com/pi",
  );
  assert.equal(
    await transcript.getByRole("link", { name: "Unsafe destination" }).count(),
    0,
  );
  assert.equal(await transcript.locator("img").count(), 0);
  await transcript
    .locator("code")
    .filter({ hasText: "retained code fence" })
    .waitFor();
  const jump = page.getByRole("button", { name: "Jump to latest" });
  const atLatest = () =>
    page.waitForFunction(() => {
      const node = document.querySelector('[aria-label="Transcript"]');
      return (
        node && node.scrollHeight - node.clientHeight - node.scrollTop <= 2
      );
    });
  await message.fill(
    `slow transcript follow\n${"Reading older lines.\n".repeat(40)}`,
  );
  await message.press("Enter");
  await transcript.locator("[data-streaming]").waitFor();
  await atLatest();
  await transcript.evaluate((node) => {
    node.scrollTop = 0;
  });
  await jump.waitFor();
  const historyTop = await transcript.evaluate((node) => node.scrollTop);
  await transcript.locator("[data-streaming]").waitFor({ state: "hidden" });
  assert.equal(await transcript.evaluate((node) => node.scrollTop), historyTop);
  await jump.press("Enter");
  await jump.waitFor({ state: "hidden" });
  await atLatest();
  assert(await transcript.evaluate((node) => node === document.activeElement));
  await message.fill(
    [`json ${quoted}`, "", "Ordinary text after the quote."].join(
      String.fromCharCode(10),
    ),
  );
  await message.press("Enter");
  await transcript
    .locator("blockquote")
    .getByText(/sender kind="external"/)
    .waitFor();
  await transcript
    .getByText("Ordinary text after the quote.", { exact: true })
    .waitFor();
  assert.equal(
    await transcript
      .getByRole("article", { name: "External peer message" })
      .count(),
    0,
  );
  const measured = await observer
    .locator("[data-chat-measure]")
    .evaluate((node) => {
      const width = node.getBoundingClientRect().width;
      (node as HTMLElement).style.maxWidth = "72ch";
      const previous = node.getBoundingClientRect().width;
      (node as HTMLElement).style.removeProperty("max-width");
      return { width, previous };
    });
  assert(measured.width > measured.previous + 100, JSON.stringify(measured));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth === innerWidth,
    ),
  );
  console.log(
    `Desktop chat measure: ${measured.previous}px → ${measured.width}px`,
  );
  await message.fill("subagent");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const agent = transcript.getByRole("article", { name: "Subagent message" });
  await agent.getByText("helper", { exact: true }).waitFor({ timeout: 15000 });
  await agent.getByText("Answered", { exact: true }).waitFor();
  assert(!(await agent.innerText()).includes("<sender"));
  // Native worker reports populate the rail; nothing is inferred from the receipt text.
  await page.getByRole("button", { name: "Show sessions" }).click();
  const toggle = page.getByRole("button", { name: "Subagents for Familiar" });
  await toggle.waitFor();
  const helper = page.getByRole("button", { name: "helper", exact: true });
  assert.equal(await helper.isVisible(), false);
  await toggle.press("Enter");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Tab");
  assert(await helper.evaluate((node) => node === document.activeElement));
  await page.keyboard.press("Escape");
  await helper.waitFor({ state: "hidden" });
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert(await toggle.evaluate((node) => node === document.activeElement));
  await page.keyboard.press("Tab");
  assert(
    await page
      .getByRole("button", { name: "New session", exact: true })
      .evaluate((node) => node === document.activeElement),
  );
  await toggle.press("Enter");
  await helper.press("Enter");
  await transcript.getByText("hello helper", { exact: true }).waitFor();
  assert.equal(
    await transcript
      .locator("strong")
      .getByText("Strong receipt", { exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Show sessions" }).click();
  assert(await helper.evaluate((node) => node === document.activeElement));
  await helper.click();
  await transcript.getByText("hello helper", { exact: true }).waitFor();
  await page
    .getByRole("combobox", { name: "Conversation" })
    .selectOption({ label: "Main" });
  await transcript
    .locator("strong")
    .getByText("Strong receipt", { exact: true })
    .waitFor();
  await observer.keyboard.press("Control+k");
  const switcher = observer.getByRole("dialog", { name: "Command palette" });
  await switcher
    .getByRole("combobox", { name: "Find a command or conversation" })
    .fill("Second");
  await observer.keyboard.press("Enter");
  await observer.getByRole("heading", { name: "Second session" }).waitFor();
  await observer.keyboard.press("Meta+k");
  await switcher.waitFor();
  await observer.keyboard.press("Escape");
  await switcher.waitFor({ state: "hidden" });
  const switchButton = observer.getByRole("button", {
    name: "Switch session",
    exact: true,
  });
  for (const dismiss of [
    () => observer.keyboard.press("Escape"),
    () => observer.mouse.click(1, 1),
  ]) {
    await switchButton.click();
    await switcher.waitFor();
    const box = await switcher.boundingBox();
    assert(
      box &&
        box.y >= 0 &&
        box.y < 150 &&
        box.x >= 0 &&
        box.x + box.width <= 1440,
    );
    await dismiss();
    await switcher.waitFor({ state: "hidden" });
    await observer.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Switch session",
    );
  }
  const phoneTrigger = page.getByRole("button", { name: "Show sessions" });
  await phoneTrigger.click();
  await page
    .getByRole("button", { name: "Switch session", exact: true })
    .click();
  const phonePalette = page.getByRole("dialog", { name: "Command palette" });
  const search = phonePalette.getByRole("combobox");
  await search.fill("session");
  await search.press("ArrowDown");
  await search.press("ArrowDown");
  const retained = await search.getAttribute("aria-activedescendant");
  assert(retained);
  await fixture.server.host.root(async (ctx) => {
    const catalog = await ctx.get(Catalog, {});
    for (let i = 0; i < 12; i++)
      await catalog.create(
        {
          title: `Palette session ${i}`,
          cwd: fixture.workspace,
          model: { provider: "faux", modelId: "faux-1" },
          thinkingLevel: "off",
        },
        ctx,
      );
  }, TEST);
  await phonePalette
    .getByRole("option", { name: /Palette session 11/ })
    .waitFor({ state: "attached" });
  assert.equal(await search.getAttribute("aria-activedescendant"), retained);
  const listbox = phonePalette.getByRole("listbox");
  assert(await listbox.evaluate((node) => node.scrollTop > 0));
  const phoneBox = await phonePalette.boundingBox();
  assert(phoneBox && phoneBox.x >= 0 && phoneBox.x + phoneBox.width <= 320);
  await search.fill("familiar helper");
  await search.press("Enter");
  await transcript.getByText("hello helper", { exact: true }).waitFor();
  await page
    .getByRole("combobox", { name: "Conversation" })
    .selectOption({ label: "Main" });
  const settingsButton = observer.getByRole("button", { name: "Settings" });
  const settingsBox = await settingsButton.boundingBox();
  assert(settingsBox && settingsBox.x < 32 && settingsBox.y > 820);
  const metadata = observer.getByLabel("Composer metadata", { exact: true });
  await metadata.waitFor();
  assert.match(await metadata.innerText(), /Faux Model/);
  await settingsButton.click();
  const preference = observer.getByRole("checkbox", {
    name: "Show composer metadata",
  });
  await preference.uncheck();
  await observer.getByRole("button", { name: "Done" }).click();
  await metadata.waitFor({ state: "hidden" });
  assert.equal(
    await observer.evaluate(() =>
      localStorage.getItem("clank:composer-metadata"),
    ),
    "hidden",
  );
  await settingsButton.click();
  await preference.check();
  await observer.getByRole("button", { name: "Done" }).click();
  await metadata.waitFor();
  const desktopToggle = observer.getByRole("button", {
    name: "Subagents for Familiar",
  });
  await desktopToggle.click();
  await observer.getByRole("button", { name: "helper", exact: true }).click();
  await observer
    .getByLabel("Transcript")
    .getByText("hello helper", { exact: true })
    .waitFor();
  assert.equal(
    await observer
      .getByRole("combobox", { name: "Conversation" })
      .locator("option:checked")
      .textContent(),
    "helper",
  );
  if (process.env.HARRHY_CLANK_SCREENSHOT_DIR) {
    const piOrigin = new URL(`http://127.0.0.1:${fixture.server.port}`);
    const native = await context.newPage();
    await native.emulateMedia({ reducedMotion: "reduce" });
    native.setDefaultTimeout(15000);
    await native.setViewportSize({ width: 1440, height: 900 });
    await native.goto(
      (await mintOwnerLink(piOrigin, fixture.dataDir, piOrigin)).href,
    );
    await native.waitForURL(piOrigin.href);
    await native.goto(new URL(`/s/${session.id}`, piOrigin).href);
    const nativeOlder = native.getByRole("link", { name: /^2 older$/ });
    await nativeOlder.click();
    await native.waitForURL("**/list/other");
    const nativeSearch = native.getByRole("searchbox", {
      name: "Search sessions and messages",
    });
    await nativeSearch.waitFor();
    assert.equal(
      await nativeSearch.evaluate((node) => node === document.activeElement),
      false,
    );
    await nativeSearch.fill("Older A");
    const hit = native
      .locator(".list-page")
      .getByRole("link", { name: /Older A/ });
    await hit.click();
    await native.goBack();
    await nativeSearch.waitFor();
    assert.equal(await nativeSearch.inputValue(), "Older A");
    await native.screenshot({
      path: join(
        process.env.HARRHY_CLANK_SCREENSHOT_DIR!,
        "p2-older-search.png",
      ),
    });
    await native.goto(new URL(`/s/${session.id}`, piOrigin).href);
    const nativeMessage = native.getByRole("textbox", { name: "Message" });
    await nativeMessage.waitFor();
    await native.getByTestId("activity").first().waitFor();
    const nativeToggle = native
      .getByRole("button", { name: /Show subagents/ })
      .first();
    await nativeToggle.click();
    await native.getByText("helper", { exact: true }).first().waitFor();
    await observer
      .getByRole("combobox", { name: "Conversation" })
      .selectOption({ label: "Main" });
    await observer
      .getByLabel("Transcript")
      .getByText("Strong receipt", { exact: true })
      .waitFor();
    await observer.getByRole("combobox", { name: "Conversation" }).press("Tab");
    await observer.getByRole("button", { name: "Session tools" }).press("Tab");
    await observer.keyboard.press("Tab");
    for (const [target, focusInput] of [
      [native, nativeMessage],
      [observer, observer.getByRole("textbox", { name: "Message" })],
    ] as const) {
      await target.keyboard.press("Tab");
      await focusInput.focus();
      assert.equal(
        await focusInput.evaluate(
          (node) => getComputedStyle(node).outlineStyle,
        ),
        "none",
      );
      await target.keyboard.type("Focus sample");
    }
    const pair = async (name: string) => {
      await native.screenshot({
        path: join(process.env.HARRHY_CLANK_SCREENSHOT_DIR!, `p2-${name}.png`),
      });
      await observer.screenshot({
        path: join(
          process.env.HARRHY_CLANK_SCREENSHOT_DIR!,
          `clank-${name}.png`,
        ),
      });
    };
    await pair("desktop");
    await native.getByRole("button", { name: "Collapse sidebar" }).click();
    await observer.getByRole("button", { name: "Hide sidebar" }).click();
    await pair("desktop-collapsed");
    await native.keyboard.press("Control+k");
    await observer.keyboard.press("Control+k");
    await native.getByRole("dialog", { name: "Command menu" }).waitFor();
    await observer.getByRole("dialog", { name: "Command palette" }).waitFor();
    await pair("desktop-switcher");
    await native.keyboard.press("Escape");
    await observer.keyboard.press("Escape");
    await observer.getByRole("button", { name: "Show sidebar" }).click();
    await native.setViewportSize({ width: 320, height: 640 });
    await native.waitForFunction(
      () =>
        Math.abs(
          document.querySelector(".main")!.getBoundingClientRect().left,
        ) < 1,
    );
    await nativeMessage.focus();
    await page.keyboard.press("Tab");
    await message.focus();
    await page.keyboard.type("Focus sample");
    await native.screenshot({
      path: join(process.env.HARRHY_CLANK_SCREENSHOT_DIR, "p2-phone.png"),
    });
    await page.screenshot({
      path: join(process.env.HARRHY_CLANK_SCREENSHOT_DIR, "clank-phone.png"),
    });
    await native.getByRole("button", { name: "Sessions", exact: true }).click();
    await native.waitForFunction(
      () =>
        Math.abs(
          document.querySelector(".drawer")!.getBoundingClientRect().left,
        ) < 1,
    );
    await page.getByRole("button", { name: "Show sessions" }).click();
    await native.screenshot({
      path: join(
        process.env.HARRHY_CLANK_SCREENSHOT_DIR,
        "p2-phone-sidebar.png",
      ),
    });
    await page.screenshot({
      path: join(
        process.env.HARRHY_CLANK_SCREENSHOT_DIR,
        "clank-phone-sidebar.png",
      ),
    });
    await native.keyboard.press("Control+k");
    await page.keyboard.press("Control+k");
    await native.getByRole("dialog", { name: "Command menu" }).waitFor();
    await page.getByRole("dialog", { name: "Command palette" }).waitFor();
    await native.screenshot({
      path: join(
        process.env.HARRHY_CLANK_SCREENSHOT_DIR,
        "p2-phone-switcher.png",
      ),
    });
    await page.screenshot({
      path: join(
        process.env.HARRHY_CLANK_SCREENSHOT_DIR,
        "clank-phone-switcher.png",
      ),
    });
    await page.keyboard.press("Escape");
    await native.close();
  }
  await observer
    .getByRole("button", { name: "Second session", exact: true })
    .click();
  await observer
    .getByLabel("Transcript")
    .getByText("No messages yet.")
    .waitFor();
  assert.equal(
    await observer
      .getByLabel("Transcript")
      .getByText("hello helper", { exact: true })
      .count(),
    0,
  );
  await observer.getByRole("button", { name: "Hide sidebar" }).click();
  assert.equal(
    await observer
      .getByRole("complementary", { name: "Session list" })
      .isVisible(),
    false,
  );
  await observer.getByRole("button", { name: "Show sidebar" }).click();
  await observer.keyboard.press("Control+k");
  await switcher.getByRole("combobox").fill("New session");
  await observer.keyboard.press("Enter");
  await switcher.waitFor({ state: "hidden" });
  await observer.waitForFunction(
    () => document.activeElement?.getAttribute("name") === "title",
  );
  const slugInput = observer.locator("input[name=slug]");
  if (process.env.HARRHY_CLANK_TEST_PI_ROOT) {
    await slugInput.fill("named-preview-session");
  } else {
    assert.equal(await slugInput.count(), 0);
  }
  await observer
    .getByLabel("Title", { exact: true })
    .fill("Created in disposable Clank");
  await observer.getByRole("button", { name: "Create session" }).click();
  await observer
    .getByRole("heading", { name: "Created in disposable Clank", exact: true })
    .waitFor();
  await observer.getByRole("textbox", { name: "Message" }).waitFor();
  let namedPath: string | undefined;
  let namedUuidPath: string | undefined;
  if (process.env.HARRHY_CLANK_TEST_PI_ROOT) {
    namedPath = new URL(observer.url()).pathname;
    assert.equal(namedPath, "/session/named-preview-session");
    const named = await fixture.server.host.root(
      async (ctx) =>
        (await ctx.get(Catalog, {})).sessions.value.find(
          (item) => item.title === "Created in disposable Clank",
        ),
      TEST,
    );
    assert(named);
    const uuidPath = `/session/${named.id}`;
    namedUuidPath = uuidPath;
    const redirect = observer.waitForResponse(
      (response) =>
        response.url().endsWith(uuidPath) && response.status() === 302,
    );
    const canonical = await observer.goto(`${origin}${uuidPath}#selection`);
    assert.equal(canonical?.status(), 200);
    const response = await redirect;
    assert.equal(response.headers().location, namedPath);
    assert.match(response.headers()["cache-control"], /no-store/);
    assert.equal(new URL(observer.url()).pathname, namedPath);
    assert.equal(new URL(observer.url()).hash, "#selection");
    await observer.reload();
    await observer.waitForFunction(
      () => document.querySelector("textarea")?.disabled === false,
    );
    await observer
      .getByRole("heading", {
        name: "Created in disposable Clank",
        exact: true,
      })
      .waitFor();
    await observer.keyboard.press("Control+k");
    await observer
      .getByRole("combobox", { name: "Find a command or conversation" })
      .fill("New session");
    await observer.keyboard.press("Enter");
    await observer
      .getByLabel("Title", { exact: true })
      .fill("Duplicate disposable session");
    await slugInput.fill("named-preview-session");
    await observer.getByRole("button", { name: "Create session" }).click();
    await observer
      .getByRole("alert")
      .getByText("That URL name is already taken.")
      .waitFor();
  }
  const noJs = await browser.newContext({
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
  });
  const staticPage = await noJs.newPage();
  await staticPage.setViewportSize({ width: 1280, height: 800 });
  const anonymous = await staticPage.goto(origin);
  assert(anonymous && !(await anonymous.text()).includes("Strong receipt"));
  if (namedUuidPath && namedPath) {
    const opaque = await staticPage.goto(`${origin}${namedUuidPath}`);
    assert.equal(opaque?.status(), 200);
    assert.equal(opaque?.headers().location, undefined);
    assert(!(await opaque!.text()).includes(namedPath));
  }
  await noJs.addCookies(await context.cookies(origin));
  const signedIn = await staticPage.goto(origin);
  assert(signedIn && /no-store/.test(signedIn.headers()["cache-control"]));
  await staticPage
    .getByRole("button", { name: "Familiar", exact: true })
    .waitFor({ timeout: 3000 });
  await staticPage
    .getByText("Strong receipt", { exact: true })
    .waitFor({ timeout: 3000 });
  assert(
    await staticPage.getByRole("textbox", { name: "Message" }).isDisabled(),
  );
  await staticPage
    .getByRole("link", { name: "2 older", exact: true })
    .waitFor();
  assert.equal(
    await staticPage
      .getByRole("button", { name: "Older A", exact: true })
      .count(),
    0,
  );
  const html = await signedIn.text();
  const direct = await staticPage.goto(`${origin}/session/${session.id}`);
  assert.equal(direct?.status(), 200);
  await staticPage.getByText("Strong receipt", { exact: true }).waitFor();
  const missing = await staticPage.goto(`${origin}/session/no-such-slug`);
  assert.equal(missing?.status(), 404);
  await staticPage.getByText("Session not found.", { exact: true }).waitFor();
  assert.equal(
    await staticPage.getByText("Strong receipt", { exact: true }).count(),
    0,
  );
  for (const cookie of await context.cookies(origin))
    assert(!html.includes(cookie.value));
  await noJs.close();
  const hydrated = await context.newPage();
  await hydrated.setViewportSize({ width: 1280, height: 800 });
  await hydrated.route("**/owner/check", async (route) => {
    await hydrated
      .getByText("Strong receipt", { exact: true })
      .waitFor({ timeout: 3000 });
    await route.continue();
  });
  await hydrated.goto(origin);
  await hydrated.waitForFunction(
    () => !document.querySelector<HTMLTextAreaElement>("textarea")?.disabled,
  );
  await hydrated.getByText("Strong receipt", { exact: true }).waitFor();
  await hydrated.waitForFunction(() => {
    const node = document.querySelector('[aria-label="Transcript"]');
    return node && node.scrollHeight - node.clientHeight - node.scrollTop <= 2;
  });
  const hydratedTranscript = hydrated.getByLabel("Transcript");
  const hydratedJump = hydrated.getByRole("button", { name: "Jump to latest" });
  await hydratedTranscript.evaluate((node) => {
    node.scrollTop = 0;
  });
  await hydratedJump.waitFor();
  const selectedLabel = await hydrated
    .getByRole("complementary", { name: "Session list" })
    .getByRole("button", { pressed: true })
    .innerText();
  await hydrated
    .getByRole("button", { name: "Second session", exact: true })
    .click();
  await hydrated.getByText("No messages yet.").waitFor();
  await hydratedJump.waitFor({ state: "hidden" });
  await hydrated
    .getByRole("button", { name: selectedLabel, exact: true })
    .click();
  await hydrated.getByText("Strong receipt", { exact: true }).waitFor();
  assert(
    await hydratedTranscript.evaluate(
      (node) => node.scrollHeight - node.scrollTop - node.clientHeight <= 2,
    ),
  );
  const movingRow = hydrated.getByRole("button", {
    name: "Age hours",
    exact: true,
  });
  const rowIndex = (node: Element) => {
    const row = node.closest("li")!;
    return Array.from(row.parentElement!.children).indexOf(row);
  };
  const originalIndex = await movingRow.evaluate(rowIndex);
  await movingRow.focus();
  await fixture.server.host.root(async (ctx) => {
    const catalog = await ctx.get(Catalog, {});
    const row = catalog.sessions.value.find(
      (item) => item.title === "Age hours",
    );
    assert(row);
    await catalog.update({ id: row.id, cwd: fixture.workspace }, ctx);
  }, TEST);
  await hydrated.waitForFunction((original) => {
    const row = [...document.querySelectorAll("#clank-sidebar li")].find(
      (item) => item.querySelector("button")?.textContent === "Age hours",
    );
    return (
      row && Array.from(row.parentElement!.children).indexOf(row) < original
    );
  }, originalIndex);
  assert(await movingRow.evaluate((node) => node === document.activeElement));
  await hydrated.close();
  const startServer = (
    await import(new URL("src/hosts/server.ts", piRoot).href)
  ).startServer;
  const draft = "Disposable unsent restart draft";
  await message.fill(draft);
  await fixture.server.close();
  await page.getByText("Offline", { exact: true }).waitFor();
  assert.equal(await message.inputValue(), draft);
  await transcript.getByText("Strong receipt", { exact: true }).waitFor();
  assert(
    await page.getByRole("button", { name: "Send", exact: true }).isDisabled(),
  );
  await transcript.evaluate((node) => {
    node.scrollTop = 0;
  });
  await jump.waitFor();
  const restartTop = await transcript.evaluate((node) => node.scrollTop);
  const beforeRestart = page.url();
  restarted = await startServer({
    port: fixture.server.port,
    dataDir: fixture.dataDir,
    fake: true,
    web: true,
    allowedHosts: [OWNER_HOST],
  });
  await page.getByText("Offline", { exact: true }).waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      !document.querySelector<HTMLButtonElement>("button[aria-label=Send]")
        ?.disabled,
  );
  assert.equal(page.url(), beforeRestart);
  await jump.waitFor();
  assert.equal(await transcript.evaluate((node) => node.scrollTop), restartTop);
  assert.equal(await message.inputValue(), draft);
  assert.equal(await transcript.getByText(draft, { exact: true }).count(), 0);
  assert.equal(
    await page.evaluate(
      async () => (await fetch("/owner/logout", { method: "POST" })).status,
    ),
    200,
  );
  await page.getByLabel("One-time token").waitFor();
  assert.equal(await page.getByLabel("Transcript").count(), 0);
  await observer.getByLabel("One-time token").waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Native HTTPS owner sign-in, Chord rename, create, stream, tool receipt, selection isolation, Markdown, subagent attribution and navigation, and logout passed",
  );
} finally {
  await browser?.close();
  for (const socket of sockets) socket.destroy();
  edge?.close();
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
  await restarted?.close();
  await fixture.close();
  await rm(dir, { recursive: true, force: true });
}
