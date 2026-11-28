import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as tlsServer } from "node:tls";
import { chromium, type Page } from "playwright";
import { checkCanonicalSwipe } from "./rail-swipe-browser.ts";
import { checkComposerFocus } from "./composer-focus-browser.ts";
import { proveRailArchive } from "./rail-browser.ts";
const OWNER_HOST = "clank.example.test";
import { structuredAttribution } from "../app/conversation/attribution.ts";

// Check the elements themselves, not just branding serialized in hydration props.
function inspectBrand({
  name,
  src,
  html,
  liveName,
}: {
  name: string;
  src: string;
  html?: string;
  liveName?: string;
}) {
  const doc =
    html === undefined
      ? document
      : new DOMParser().parseFromString(html, "text/html");
  function missing() {
    if (doc.title !== name && doc.title !== liveName) return "title";
    if (!doc.head.querySelector(`link[rel~=icon][href="${src}"]`))
      return "favicon";
    if (!doc.querySelector(`#clank-sidebar img[src="${src}"]`))
      return "rail mark";
    const root = doc.documentElement;
    if (
      root.dataset.piTint !== "custom" ||
      root.style.getPropertyValue("--pi-base-hue").trim() !== "217"
    )
      return "tint";
    return null;
  }
  const state = { missing: missing() };
  if (liveName) {
    // Remember a transient reset even if the branding subscription repairs it.
    new MutationObserver(() => {
      state.missing ??= missing();
    }).observe(doc, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  return state;
}

const palette = (target: Page) =>
  target.getByRole("dialog", { name: "Command palette", exact: true });
async function headerPalette(target: Page) {
  await target.getByRole("button", { name: "Session tools" }).press("Enter");
  await target
    .getByRole("menuitem", { name: "Switch conversation…", exact: true })
    .press("Enter");
  return palette(target);
}

// In the response-body case inspect parsed elements, not matching strings in
// the serialized session seed. Return only diagnostic labels, never the HTML.
function receiptProblem(scope: Element, html?: string) {
  const root =
    html === undefined
      ? scope
      : new DOMParser()
          .parseFromString(html, "text/html")
          .querySelector('[aria-label="Transcript"]');
  if (!root) return "missing transcript";
  const has = (selector: string, label: string) =>
    [...root.querySelectorAll(selector)].some(
      (node) => node.textContent.trim() === label,
    );
  if (!has("strong", "Strong receipt")) return "missing strong";
  if (!has('a[href="https://example.com/pi"]', "Pi docs"))
    return "missing safe link";
  if (
    !has("pre code", "const answer = 42;") ||
    !has("pre code span[style]", "42")
  )
    return "missing highlighted code block";
  if (
    root.querySelector('a[href^="javascript:" i]') ||
    has("a[href]", "Unsafe destination")
  )
    return "active unsafe link";
  if (root.querySelector("img") || has("button", "Raw fixture control"))
    return "active media or raw HTML";
  return null;
}

const rowIndex = (node: Element) => {
  const row = node.closest("li")!;
  return Array.from(row.parentElement!.children).indexOf(row);
};

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
const { startFixture, holdIn, TEST } = (await import(
  new URL("__tests__/p2/helpers.ts", piRoot).href
)) as typeof import("../../pi/__tests__/p2/helpers.ts");
const { Catalog } = (await import(
  new URL("plugins/sessions/contract.ts", piRoot).href
)) as typeof import("../../pi/plugins/sessions/contract.ts");
const { SessionTree } = (await import(
  new URL("plugins/tree/contract.ts", piRoot).href
)) as typeof import("../../pi/plugins/tree/contract.ts");
const { ThemeBranding } = (await import(
  new URL("plugins/settings/theme-contract.ts", piRoot).href
)) as typeof import("../../pi/plugins/settings/theme-contract.ts");
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
    timezoneId: "America/Los_Angeles",
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
  const familiarButton = page.getByRole("button", {
    name: "Familiar",
    exact: true,
  });
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
  await familiarButton.waitFor();
  assert.equal(
    await page.getByRole("region", { name: "Session detail" }).isVisible(),
    false,
  );
  await familiarButton.press("Enter");
  await page
    .getByRole("heading", { name: session.title, exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("complementary", { name: "Session list" }).isVisible(),
    false,
  );
  await page.getByRole("button", { name: "Show sessions" }).click();
  assert(
    await familiarButton.evaluate((node) => node === document.activeElement),
  );
  await familiarButton.click();
  const cookies = await context.cookies(origin);
  assert(
    cookies.some(
      (cookie) =>
        cookie.httpOnly && cookie.secure && cookie.domain === OWNER_HOST,
    ),
  );
  function assertNoCredentials(html: string) {
    const secrets = [
      invite.hash.slice(1),
      ...cookies
        .filter((cookie) => cookie.httpOnly)
        .map((cookie) => cookie.value),
      ...fixture.owner.cookie
        .split("; ")
        .map((pair) => pair.slice(pair.indexOf("=") + 1)),
    ];
    assert(
      !secrets.some((value) => html.includes(value)),
      "credential in document",
    );
  }
  const observer = await context.newPage();
  observer.setDefaultTimeout(8000);
  await observer.setViewportSize({ width: 1440, height: 900 });
  await observer.goto(origin);
  const secondRow = observer.getByRole("button", {
    name: "Second session",
    exact: true,
  });
  // The age is now a sibling of the primary button. Its stretched hit area
  // must still select the row well beyond the label, short of the end control.
  await observer
    .locator('button[aria-label="Session tools"]:enabled')
    .waitFor();
  const desktopMessage = observer.getByRole("textbox", { name: "Message" });
  const desktopSearch = observer.getByRole("searchbox", {
    name: "Search sessions and messages",
  });
  await observer.getByRole("link", { name: "2 older" }).press("Enter");
  await desktopSearch.and(observer.locator(":focus")).waitFor();
  await observer.goBack();
  const secondItem = observer.getByRole("listitem").filter({ has: secondRow });
  const secondBox = await secondItem.boundingBox();
  assert(secondBox);
  await secondItem.click({
    position: { x: secondBox.width - 40, y: secondBox.height / 2 },
  });
  await observer
    .getByRole("heading", { name: "Second session", exact: true })
    .waitFor();
  await desktopMessage.and(observer.locator(":focus")).waitFor();
  const familiarRow = observer.getByRole("button", {
    name: "Familiar",
    exact: true,
  });
  const familiarItem = observer
    .getByRole("listitem")
    .filter({ has: familiarRow });
  const familiarBox = await familiarItem.boundingBox();
  assert(familiarBox);
  await familiarItem.click({
    position: { x: familiarBox.width - 4, y: familiarBox.height / 2 },
  });
  await observer
    .getByRole("heading", { name: session.title, exact: true })
    .waitFor();
  assert.equal(
    await observer.getByRole("button", { name: "Show sessions" }).isVisible(),
    false,
  );
  // Mutate Pi over a separate native owner connection, not the Clank document.
  const brandOwner = fixture.client({ Cookie: fixture.owner.cookie });
  await brandOwner.host.root(async (ctx) => {
    const brand = await ctx.get(ThemeBranding, {});
    assert.equal(brand.variant, "owner");
    const defaultTitle = await observer.title();
    const name = "Disposable brand";
    await brand.setName({ name }, ctx);
    await brand.setTint({ tint: 217 }, ctx);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>';
    await brand.setLogo({ base64: Buffer.from(svg).toString("base64") }, ctx);
    const logo = familiarRow.locator('img[src^="data:image/png;base64,"]');
    await logo.waitFor();
    const src = await logo.getAttribute("src");
    assert(src);
    await observer.waitForFunction(
      ({ name: expectedName, src: expectedSrc }) =>
        document.title === expectedName &&
        getComputedStyle(document.body).backgroundColor.startsWith("oklch(") &&
        (document.querySelector<HTMLImageElement>("#clank-sidebar img")
          ?.naturalWidth ?? 0) > 0 &&
        document.documentElement.dataset.piTint === "custom" &&
        document.documentElement.style.getPropertyValue("--pi-base-hue") ===
          "217" &&
        [
          ...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
        ].some((icon) => icon.href === expectedSrc),
      { name, src },
    );
    const noScript = await browser.newContext({
      ignoreHTTPSErrors: true,
      javaScriptEnabled: false,
    });
    const staticBrand = await noScript.newPage();
    const publicResponse = await staticBrand.goto(origin);
    assert.equal(publicResponse?.status(), 200);
    const publicHtml = await publicResponse!.text();
    assertNoCredentials(publicHtml);
    assert(!publicHtml.includes(name) && !publicHtml.includes(src));
    assert(!/--pi-base-hue\s*:\s*217\b/.test(publicHtml));
    await noScript.addCookies(cookies);
    const response = await staticBrand.goto(origin);
    assert.equal(response?.status(), 200);
    const html = await response!.text();
    assertNoCredentials(html);
    assert(html.includes("Disposable Clank session"));
    assert.equal(
      (await staticBrand.evaluate(inspectBrand, { name, src, html })).missing,
      null,
      "raw owner HTML",
    );
    assert.equal(
      (await staticBrand.evaluate(inspectBrand, { name, src })).missing,
      null,
      "no-script document",
    );
    assert(
      await staticBrand
        .locator(`#clank-sidebar img[src="${src}"]:visible`)
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth > 0),
    );
    assert.match(
      await staticBrand
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor),
      /^oklch\(/,
    );
    await noScript.close();

    const paint = await context.newPage();
    await paint.setViewportSize({ width: 1280, height: 800 });
    const bundle = Promise.withResolvers<void>();
    const check = Promise.withResolvers<void>();
    await paint.route("**/owner-sessions.js", async (route) => {
      await bundle.promise;
      await route.continue();
    });
    await paint.route("**/owner/check", async (route) => {
      await check.promise;
      await route.continue();
    });
    await paint.goto(origin, { waitUntil: "commit" });
    await paint
      .getByRole("button", { name: "Familiar", exact: true })
      .waitFor();
    const liveName = "Updated disposable brand";
    const continuity = await paint.evaluateHandle(inspectBrand, {
      name,
      src,
      liveName,
    });
    const missingBrand = () => continuity.evaluate((state) => state.missing);
    assert.equal(await missingBrand(), null, "waiting for bundle");
    const checking = paint.waitForRequest("**/owner/check", { timeout: 8000 });
    bundle.resolve();
    await checking;
    assert.equal(await missingBrand(), null, "waiting for owner check");
    check.resolve();
    await paint.locator('button[aria-label="Session tools"]:enabled').waitFor();
    assert.equal(await missingBrand(), null, "initial live catalog");
    await brand.setName({ name: liveName }, ctx);
    await paint.waitForFunction((next) => document.title === next, liveName);
    assert.equal(await missingBrand(), null, "handoff to live branding");
    await paint.close();
    await brand.setName({ name: null }, ctx);
    await brand.setTint({ tint: null }, ctx);
    await brand.clearLogo(ctx);
    await familiarRow.locator("svg").waitFor();
    await observer.waitForFunction(
      ({ defaultTitle: expectedTitle, src: expectedSrc }) =>
        document.title === expectedTitle &&
        !document.documentElement.dataset.piTint &&
        !document.documentElement.style.getPropertyValue("--pi-base-hue") &&
        ![
          ...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
        ].some((icon) => icon.href === expectedSrc),
      { defaultTitle, src },
    );
  }, TEST);
  await brandOwner.host.close(TEST);
  const tools = page.getByRole("button", { name: "Session tools" });
  async function rename() {
    await tools.press("Enter");
    await page.getByRole("menuitem", { name: "Rename" }).press("Enter");
  }
  await tools.press("Enter");
  await page.getByRole("menuitem", { name: "Rename" }).waitFor();
  await page.getByRole("menuitem", { name: "Switch conversation…" }).waitFor();
  await page.getByRole("menuitem", { name: "Rename" }).press("Enter");
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
  await checkComposerFocus(page);
  await message.fill(prompt);
  await message.press("Shift+Enter");
  assert.equal(await message.inputValue(), prompt + String.fromCharCode(10));
  await message.dispatchEvent("compositionstart");
  await message.press("Enter");
  assert((await message.inputValue()).startsWith(prompt));
  assert(
    await page.getByRole("button", { name: "Send", exact: true }).isEnabled(),
  );
  const observerTranscript = observer.getByLabel("Transcript");
  await observerTranscript.focus();
  await message.dispatchEvent("compositionend");
  await message.press("Enter");
  await page.locator("[data-streaming]").filter({ hasText: "Echo:" }).waitFor();
  await observerTranscript.getByText(prompt, { exact: true }).waitFor();
  assert(await observerTranscript.evaluate((node) => node.matches(":focus")));
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
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await message.fill("slow-tool");
  await message.press("Enter");
  const running = page
    .locator("[data-tool-activity][data-state=working]")
    .getByRole("button", { name: /Running printf/ });
  await running.waitFor({ timeout: 10000 });
  const trigger = await running.elementHandle();
  assert(trigger);
  const receipt = page.getByRole("button", {
    name: /ran a command.*Show the steps/i,
  });
  await receipt.waitFor({ timeout: 15000 });
  assert(
    await receipt.evaluate((node, original) => node === original, trigger),
  );
  await receipt.press("ArrowUp");
  await page.waitForFunction(
    (node) =>
      node
        .querySelector("[data-slide=backward] [data-current]")
        ?.getAnimations()
        .some(
          (motion) =>
            motion instanceof CSSTransition &&
            motion.transitionProperty === "transform",
        ),
    trigger,
  );
  assert(await trigger.evaluate((node) => node === document.activeElement));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.press("ArrowDown");
  await receipt.waitFor();
  assert.equal(
    await receipt.evaluate(
      (node) => node.getAnimations({ subtree: true }).length,
    ),
    0,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Native faux `json <text>` streams the exact answer. Finish the formatted
  // blocks first, then keep emitting deltas so a settled render cannot pass.
  const markdown = [
    "**Strong receipt** and [Pi docs](https://example.com/pi).",
    "[Unsafe destination](javascript:void%200)",
    `![Fixture media](${origin}/fixture-media.png) <button>Raw fixture control</button>`,
    "```js\nconst answer = 42;\n```",
    "Still writing. ".repeat(250) + "End of fixture answer.",
  ].join("\n\n");
  const transcript = page.getByLabel("Transcript");
  const liveText = transcript.locator("[data-streaming]");
  const settledStrong = transcript
    .locator("strong")
    .filter({ hasText: /^Strong receipt$/ });
  const markerWatch = await transcript.evaluateHandle((node) => {
    let sawMarkers = false;
    const watch = new MutationObserver(() => {
      const live = node.querySelector<HTMLElement>("[data-streaming]");
      if (live?.innerText.includes("**")) sawMarkers = true;
    });
    watch.observe(node, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-streaming"],
    });
    return () => {
      watch.disconnect();
      return sawMarkers;
    };
  });
  await message.fill(`json ${markdown}`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const liveStrong = liveText
    .locator("strong")
    .filter({ hasText: /^Strong receipt$/ });
  await liveText.getByRole("link", { name: "Pi docs", exact: true }).waitFor();
  await liveText
    .locator("pre code")
    .filter({ hasText: "const answer = 42;" })
    .waitFor();
  await liveStrong.waitFor();
  assert.equal(await liveText.evaluate(receiptProblem), null);
  const prefix = await liveStrong.evaluateHandle((node) => ({
    host: node.closest("[data-streaming]")!,
    strong: node,
  }));
  assert(
    await prefix.evaluate(
      ({ host }) =>
        host.isConnected &&
        !host.textContent.includes("End of fixture answer."),
    ),
    "sample must precede the final delta",
  );
  const shots = process.env.HARRHY_CLANK_WORDS_SCREENSHOT_DIR;
  if (shots) {
    await liveStrong.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shots, "words-streaming.png") });
    assert(
      await prefix.evaluate(({ host }) => host.hasAttribute("data-streaming")),
    );
  }
  await liveText.waitFor({ state: "detached", timeout: 15000 });
  assert.equal(
    await markerWatch.evaluate((stop) => stop()),
    false,
    "visible ** while streaming",
  );
  await markerWatch.dispose();
  assert(
    await settledStrong.evaluate(
      (node, { host, strong }) =>
        node === strong &&
        host.contains(node) &&
        host.textContent.includes("End of fixture answer."),
      prefix,
    ),
    "settling replaced the live host or formatted prefix",
  );
  assert.equal(
    await prefix.evaluate(({ host }) => host.textContent.includes("**")),
    false,
  );
  await prefix.dispose();
  assert.equal(await transcript.evaluate(receiptProblem), null);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  await transcript
    .getByRole("button", { name: "Copy code", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "const answer = 42;\n",
  );
  if (shots) {
    await settledStrong.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shots, "words-settled.png") });
  }
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
  try {
    await atLatest();
  } catch (error) {
    console.error(
      "Streaming transcript did not follow",
      await transcript.evaluate((node) => ({
        top: node.scrollTop,
        height: node.clientHeight,
        content: node.scrollHeight,
      })),
      { jumpVisible: await jump.isVisible() },
    );
    throw error;
  }
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
    [
      `json ${quoted}`,
      ">",
      "> Quoted fixture line.",
      "",
      "Ordinary text after the quote.",
    ].join(String.fromCharCode(10)),
  );
  await message.press("Enter");
  await transcript
    .locator("blockquote")
    .filter({ hasText: "Quoted fixture line." })
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
  await agent.getByText("answered", { exact: true }).waitFor();
  assert(!(await agent.innerText()).includes("<sender"));
  // Native worker reports populate the rail; nothing is inferred from the receipt text.
  await page.getByRole("button", { name: "Show sessions" }).click();
  const toggle = page.getByRole("button", { name: "Subagents for Familiar" });
  await toggle.waitFor();
  const helper = page.getByRole("button", { name: "helper", exact: true });
  assert.equal(await helper.isVisible(), false);
  await toggle.press("Enter");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  assert.equal(
    await page
      .getByRole("button", { name: "Archive helper", exact: true })
      .count(),
    0,
  );
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
  // Fork real fixture history, then restore Pi's main pointer. Clank should
  // still offer the non-main branch when a different session is selected.
  const treeOwner = fixture.browser();
  try {
    const tree = await holdIn(
      treeOwner,
      SessionTree,
      { session: session.id },
      "owner",
    );
    await tree.branch(
      { conversation: session.main, label: "Witness branch" },
      TEST,
    );
    await tree.select({ conversation: session.main }, TEST);
    tree.release();
  } finally {
    await treeOwner.close(TEST);
  }
  const phonePalette = await headerPalette(page);
  const search = phonePalette.getByRole("searchbox", {
    name: "Find a command or conversation",
  });
  await phonePalette
    .getByRole("button", { name: /^Second session\b/i })
    .click();
  const secondHeading = page.getByRole("heading", {
    name: "Second session",
    exact: true,
  });
  await secondHeading.waitFor();
  await headerPalette(page);
  const options = phonePalette
    .getByRole("list", { name: "Commands and conversations" })
    .getByRole("button");
  const olderOption = phonePalette.getByRole("button", { name: /^Older B\b/ });
  const recentHelper = phonePalette.getByRole("button", {
    name: /^helper\b/,
  });
  const family = phonePalette.getByRole("list", {
    name: "Conversations in Familiar",
    exact: true,
  });
  const parentButton = phonePalette.getByRole("button", {
    name: /^Familiar\b/i,
  });
  const helperButton = family.getByRole("button", { name: /^helper\b/ });
  const parentText = parentButton.locator("span").first();
  const childText = helperButton.locator("span").first();
  const rowBoxes = await Promise.all(
    [
      parentText,
      childText,
      parentButton.locator(":scope > span").last(),
      helperButton.locator(":scope > span").last(),
    ].map((el) => el.boundingBox()),
  );
  const [parentName, childName, parentSlot, childSlot] = rowBoxes;
  assert(parentName && childName && parentSlot && childSlot);
  assert(
    childName.x > parentName.x &&
      childSlot.x === parentSlot.x &&
      childSlot.width === parentSlot.width &&
      parentSlot.x > parentName.x + parentName.width,
  );
  // The prior visit was the helper, despite its parent being rendered first.
  await search.press("Enter");
  await transcript.getByText("hello helper", { exact: true }).waitFor();
  await headerPalette(page);
  await search.press("Enter");
  await secondHeading.waitFor();
  await headerPalette(page);
  await search.fill("helper");
  await helperButton.waitFor();
  // Only the child matches. Enter chooses it; Tab can explicitly choose its parent.
  assert.equal(await helperButton.getAttribute("data-default"), "");
  assert.equal(await parentButton.getAttribute("data-default"), null);
  await search.press("Enter");
  await transcript.getByText("hello helper", { exact: true }).waitFor();
  await headerPalette(page);
  await search.fill("helper");
  await search.press("Tab");
  await parentButton.and(page.locator(":focus")).press("Tab");
  await helperButton.and(page.locator(":focus")).press("Shift+Tab");
  await parentButton.and(page.locator(":focus")).press("Enter");
  await transcript
    .locator("strong")
    .getByText("Strong receipt", { exact: true })
    .waitFor();
  await headerPalette(page);
  await phonePalette
    .getByRole("button", { name: /^Second session\b/i })
    .click();
  await secondHeading.waitFor();
  await headerPalette(page);
  for (const blank of ["", "   "]) {
    await search.fill("Older B");
    await olderOption.waitFor();
    await search.fill(blank);
    await recentHelper.waitFor();
    await phonePalette
      .getByRole("button", { name: /^Age minutes\b/ })
      .waitFor();
    assert.equal(
      await phonePalette
        .getByRole("list", { name: "Commands and conversations" })
        .getByRole("button", {
          name: /Older B|Age (hours|days)|\b(?:Branch|Command)\b/i,
        })
        .count(),
      0,
    );
    // Arrows wrap within the displayed subset, not the searchable catalog.
    const ids = await options.evaluateAll((nodes) => nodes.map((n) => n.id));
    for (const [index, id] of [ids.at(-1), ...ids].entries()) {
      await page.keyboard.press(index === 0 ? "ArrowUp" : "ArrowDown");
      assert.equal(await page.evaluate(() => document.activeElement?.id), id);
    }
  }
  const closeButton = phonePalette.getByRole("button", {
    name: "Close command palette",
  });
  assert.equal(await closeButton.getAttribute("tabindex"), "-1");
  for (const filter of ["", "Age", "No such palette target"]) {
    await search.fill(filter);
    const results = await options.all();
    assert(
      filter === "No such palette target"
        ? !results.length
        : results.length > 1,
    );
    for (const [key, order] of [
      ["Tab", results],
      ["Shift+Tab", results.toReversed()],
    ] as const) {
      for (const expected of [...order, search, ...order, search]) {
        await page.keyboard.press(key);
        assert(
          await expected.evaluate(
            (node) => node === document.activeElement && document.hasFocus(),
          ),
        );
      }
    }
  }
  await search.fill("Older B");
  await search.press("Tab");
  await olderOption.and(page.locator(":focus")).press("Enter");
  await page.getByRole("heading", { name: "Older B", exact: true }).waitFor();
  await headerPalette(page);
  await search.press("Enter");
  await secondHeading.waitFor();
  await headerPalette(page);
  await search.fill("Witness branch");
  await phonePalette.getByRole("button", { name: /Witness branch/i }).click();
  const branchHeading = page.getByText("Branch · Witness branch", {
    exact: true,
  });
  await branchHeading.waitFor();
  // Visiting the four-day-old session explicitly makes it eligible in this tab.
  // Branches still need a query.
  for (const [shortcut, destination] of [
    ["Meta+k", secondHeading],
    ["Control+k", page.getByRole("heading", { name: "Older B", exact: true })],
  ] as const) {
    await page.keyboard.press(shortcut);
    await search.and(page.locator(":focus")).waitFor();
    assert.equal(await search.inputValue(), "");
    await page.keyboard.press("Enter");
    await destination.waitFor();
  }
  await headerPalette(page);
  await phonePalette.getByRole("button", { name: /^Familiar\b/i }).click();
  await transcript
    .locator("strong")
    .getByText("Strong receipt", { exact: true })
    .waitFor();

  const switcher = await headerPalette(observer);
  const query = switcher.getByRole("searchbox", {
    name: "Find a command or conversation",
  });
  await query.fill("Search sessions and messages");
  await switcher
    .getByRole("button", { name: /Search sessions and messages/ })
    .click();
  await switcher.waitFor({ state: "hidden" });
  await desktopSearch.and(observer.locator(":focus")).waitFor();
  // This invoker survives selection, so dialog focus restoration alone cannot pass.
  const switchButton = observer.getByRole("button", {
    name: "Switch session",
    exact: true,
  });
  await switchButton.press("Enter");
  await query.and(observer.locator(":focus")).waitFor();
  // Chromium sets isComposing on real keystrokes during a CDP IME session.
  const ime = await context.newCDPSession(observer);
  await ime.send("Input.imeSetComposition", {
    text: "Second",
    selectionStart: 6,
    selectionEnd: 6,
  });
  await switcher.getByRole("button", { name: /^Second session\b/i }).waitFor();
  await observer.keyboard.press("Enter");
  assert(await query.isVisible(), "IME Enter must not activate a result");
  await ime.send("Input.insertText", { text: "Second" });
  await ime.detach();
  await observer.keyboard.press("Enter");
  await switcher.waitFor({ state: "hidden" });
  await observer.getByRole("heading", { name: "Second session" }).waitFor();
  await desktopMessage.and(observer.locator(":focus")).waitFor();
  await observer.keyboard.press("Meta+k");
  await switcher.waitFor();
  await observer.keyboard.press("Escape");
  await switcher.waitFor({ state: "hidden" });
  for (const dismiss of [
    async () => {
      await query.press("Tab");
      await switcher
        .getByRole("list", { name: "Commands and conversations" })
        .getByRole("button")
        .first()
        .and(observer.locator(":focus"))
        .waitFor();
      await observer.keyboard.press("Escape");
    },
    () =>
      switcher
        .getByRole("button", { name: "Close command palette" })
        .press("Enter"),
    async () => {
      await query.fill("no such palette target");
      await query.press("Escape");
    },
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
    // A press crossing the border in either direction is not a backdrop click.
    const inside = [box.x + 4, box.y + box.height / 2] as const;
    for (const outward of [true, false]) {
      const outside = [1, inside[1]] as const;
      const start = outward ? inside : outside;
      const end = outward ? outside : inside;
      await observer.mouse.move(start[0], start[1]);
      await observer.mouse.down();
      await observer.mouse.move(end[0], end[1], { steps: 4 });
      await observer.mouse.up();
      assert(await switcher.isVisible());
    }
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
  await search.fill("session");
  // Select a pre-existing catalog result, not one of the leading commands.
  await search.press("ArrowUp");
  const retained = await page.evaluate(() => document.activeElement?.id);
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
    .getByRole("button", { name: /Palette session 11/ })
    .waitFor({ state: "attached" });
  assert.equal(await page.evaluate(() => document.activeElement?.id), retained);
  // Revealing a keyboard selection should scroll; a catalog publish need not.
  await search.fill("Palette session");
  await search.press("ArrowUp");
  const listbox = phonePalette.getByRole("list", {
    name: "Commands and conversations",
  });
  assert(await listbox.evaluate((node) => node.scrollTop > 0));
  const phoneBox = await phonePalette.boundingBox();
  assert(phoneBox && phoneBox.x >= 0 && phoneBox.x + phoneBox.width <= 320);
  // Remove the highlighted destination from another live browser. Enter
  // with the same query must not dispatch that now-stale choice.
  await search.fill("Palette session 11");
  const victimOption = phonePalette.getByRole("button", {
    name: /Palette session 11/,
  });
  await search.press("Tab");
  await victimOption.and(page.locator(":focus")).waitFor();
  await observer
    .getByRole("button", { name: "Palette session 11", exact: true })
    .hover();
  await observer
    .getByRole("button", { name: "Archive Palette session 11", exact: true })
    .click();
  const confirmation = observer.getByRole("dialog", {
    name: "Archive session “Palette session 11”?",
  });
  await confirmation
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await confirmation.waitFor({ state: "hidden" });
  await options.waitFor({ state: "hidden" });
  await search.and(page.locator(":focus")).waitFor();
  await search.press("Enter");
  assert(await search.isVisible());

  await search.fill("Second session");
  await search.press("Enter");
  await secondHeading.waitFor();
  await message.focus();
  await page.keyboard.press("Control+k");
  await search.fill("familiar helper");
  await search.press("Enter");
  await transcript.getByText("hello helper", { exact: true }).waitFor();
  await page.getByRole("heading", { level: 1 }).dblclick();
  await search.press("Escape");
  await tools.and(page.locator(":focus")).waitFor();
  await message.focus();
  await page.keyboard.press("Control+k");
  await search.press("Escape");
  await message.and(page.locator(":focus")).waitFor();
  await (
    await headerPalette(page)
  )
    .getByRole("button", { name: /^Familiar\b/i })
    .click();
  const settingsButton = observer.getByRole("button", { name: "Settings" });
  const settingsBox = await settingsButton.boundingBox();
  assert(settingsBox && settingsBox.x < 300 && settingsBox.y > 820);
  const metadata = observer.getByLabel("Composer metadata", { exact: true });
  await metadata.waitFor();
  assert.match(await metadata.innerText(), /Faux Model.*off/s);
  await metadata
    .getByRole("img", { name: /browsers viewing this session/ })
    .waitFor();
  await page
    .getByLabel("Composer metadata", { exact: true })
    .getByRole("img", { name: /Cache hit rate: \d+ percent/ })
    .waitFor();
  await page
    .getByLabel("Composer metadata", { exact: true })
    .getByTitle(/Session total cost/)
    .waitFor();
  await metadata
    .getByRole("progressbar", { name: "Estimated active context usage" })
    .waitFor();
  const rules = await observer
    .getByRole("textbox", { name: "Message" })
    .evaluate((node) => {
      const style = getComputedStyle(node);
      const box = getComputedStyle(node.parentElement!);
      return {
        input: style.borderBlockWidth,
        padding: [style.paddingTop, style.paddingBottom],
        top: box.borderTop,
        bottom: box.borderBottom,
        width: box.borderTopWidth,
      };
    });
  assert.equal(rules.input, "0px");
  assert.equal(rules.top, rules.bottom);
  assert.equal(rules.width, "1px");
  assert.equal(rules.padding[0], rules.padding[1]);
  const themeBackground = (target = observer) =>
    target
      .locator("body")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
  await observer.emulateMedia({ colorScheme: "light" });
  assert.equal(await themeBackground(), "rgb(251, 250, 248)");
  await observer.emulateMedia({ colorScheme: "dark" });
  assert.equal(await themeBackground(), "rgb(21, 20, 19)");
  await observer.emulateMedia({ colorScheme: "light" });
  await observer.getByRole("button", { name: "Cycle color theme" }).click();
  await settingsButton.click();
  const settings = observer.getByRole("dialog", { name: "Settings" });
  assert(await settings.getByRole("radio", { name: "Light" }).isChecked());
  await settings.getByRole("radio", { name: "Dark" }).check();
  assert.equal(await themeBackground(), "rgb(21, 20, 19)");
  const themeCookie = "__Host-clank-theme";
  const darkCookie = (await context.cookies(origin)).find(
    (cookie) => cookie.name === themeCookie,
  );
  assert.equal(darkCookie?.value, "dark", "Settings persists the theme cookie");
  const noScriptTheme = await browser.newContext({
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
  });
  await noScriptTheme.addCookies(await context.cookies(origin));
  const firstPaint = await noScriptTheme.newPage();
  const backgrounds = { light: "rgb(251, 250, 248)", dark: "rgb(21, 20, 19)" };
  for (const mode of ["dark", "light"] as const) {
    await noScriptTheme.addCookies([
      { name: themeCookie, value: mode, url: origin, secure: true },
    ]);
    await firstPaint.emulateMedia({
      colorScheme: mode === "dark" ? "light" : "dark",
    });
    const response = await firstPaint.goto(origin);
    const html = await response!.text();
    assert(new RegExp(`<html\\b[^>]* data-theme="${mode}"`).test(html));
    assertNoCredentials(html);
    assert.equal(
      await themeBackground(firstPaint),
      backgrounds[mode],
      `no-script ${mode} preference`,
    );
  }
  await noScriptTheme.clearCookies({ name: themeCookie });
  await firstPaint.goto(origin);
  assert.equal(
    await firstPaint.locator("html").getAttribute("data-theme"),
    null,
  );
  for (const colorScheme of ["light", "dark"] as const) {
    await firstPaint.emulateMedia({ colorScheme });
    assert.equal(
      await themeBackground(firstPaint),
      backgrounds[colorScheme],
      `no-script system ${colorScheme}`,
    );
  }
  await noScriptTheme.close();

  // Simulate an existing installation. Hydration migrates the legacy value only
  // if there isn't already an authoritative cookie.
  for (const hasCookie of [false, true]) {
    const legacy = await browser.newContext({
      ignoreHTTPSErrors: true,
      colorScheme: hasCookie ? "dark" : "light",
      storageState: {
        cookies: cookies.filter((cookie) => cookie.name !== themeCookie),
        origins: [
          { origin, localStorage: [{ name: "clank:theme", value: "dark" }] },
        ],
      },
    });
    if (hasCookie)
      await legacy.addCookies([
        { name: themeCookie, value: "light", url: origin, secure: true },
      ]);
    const migrated = await legacy.newPage();
    await migrated.goto(origin);
    await migrated
      .locator('button[aria-label="Session tools"]:enabled')
      .waitFor();
    await migrated.getByRole("button", { name: "Settings" }).click();
    const expected = hasCookie ? "light" : "dark";
    assert(
      await migrated
        .getByRole("radio", { name: hasCookie ? "Light" : "Dark", exact: true })
        .isChecked(),
    );
    assert.equal(await themeBackground(migrated), backgrounds[expected]);
    assert.equal(
      (await legacy.cookies(origin)).find(
        (cookie) => cookie.name === themeCookie,
      )?.value,
      expected,
    );
    await legacy.close();
  }
  await observer.setViewportSize({ width: 320, height: 640 });
  const settingsBounds = await settings.boundingBox();
  assert(
    settingsBounds &&
      settingsBounds.x >= 0 &&
      settingsBounds.x + settingsBounds.width <= 320,
  );
  if (process.env.HARRHY_CLANK_SCREENSHOT_DIR)
    await settings.screenshot({
      path: join(
        process.env.HARRHY_CLANK_SCREENSHOT_DIR,
        "clank-dark-settings-phone.png",
      ),
    });
  await observer.setViewportSize({ width: 1440, height: 900 });
  await settings.getByRole("radio", { name: "System" }).check();
  const preference = observer.getByRole("checkbox", {
    name: "Show composer metadata",
  });
  await settings.getByRole("radio", { name: "1 day", exact: true }).check();
  await settings
    .getByRole("checkbox", { name: "Enter to send on desktop" })
    .uncheck();
  await preference.uncheck();
  await observer.getByRole("button", { name: "Close settings" }).click();
  await metadata.waitFor({ state: "hidden" });
  assert.equal(
    await observer.evaluate(() =>
      localStorage.getItem("clank:composer-metadata"),
    ),
    "hidden",
  );
  await observer.getByRole("link", { name: "3 older", exact: true }).waitFor();
  await desktopMessage.fill("Desktop draft");
  await desktopMessage.press("Enter");
  assert.equal(await desktopMessage.inputValue(), "Desktop draft\n");
  await desktopMessage.fill("");
  await settingsButton.click();
  await settings.getByRole("radio", { name: "Forever" }).check();
  await settings
    .getByRole("checkbox", { name: "Enter to send on desktop" })
    .check();
  await preference.check();
  await observer.getByRole("button", { name: "Close settings" }).click();
  await metadata.waitFor();
  await observer
    .getByRole("button", { name: "Older A", exact: true })
    .waitFor();
  await settingsButton.click();
  await settings.getByRole("radio", { name: "3 days" }).check();
  await settings.getByRole("button", { name: "Close settings" }).click();
  await observer.getByRole("link", { name: "2 older", exact: true }).waitFor();
  const desktopToggle = observer.getByRole("button", {
    name: "Subagents for Familiar",
  });
  await desktopToggle.click();
  await observer.getByRole("button", { name: "helper", exact: true }).click();
  await observer
    .getByLabel("Transcript")
    .getByText("hello helper", { exact: true })
    .waitFor();
  await observer
    .getByRole("button", { name: "helper", pressed: true, exact: true })
    .waitFor();
  assert.equal(await familiarRow.getAttribute("aria-pressed"), "false");

  const touch = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 667 },
    ignoreHTTPSErrors: true,
  });
  await touch.addCookies(await context.cookies(origin));
  const phone = await touch.newPage();
  phone.setDefaultTimeout(8000);
  await phone.clock.install();
  await phone.goto(`${origin}/session/${session.id}`);
  const touchTools = phone.getByRole("button", { name: "Session tools" });
  await touchTools.tap();
  await phone.getByRole("menuitem", { name: "Switch conversation…" }).tap();
  const touchPalette = palette(phone);
  await touchPalette.waitFor();
  // First visit in a clean context: don't default to the current main.
  assert.equal(
    await touchPalette
      .getByRole("button", { name: /^Familiar\b/i })
      .getAttribute("data-default"),
    null,
  );
  await phone.touchscreen.tap(1, 1);
  await touchPalette.waitFor({ state: "hidden" });
  await touchTools.and(phone.locator(":focus")).waitFor();
  async function tapConversation(name: RegExp) {
    await phone.getByRole("button", { name: "Session tools" }).tap();
    await phone.getByRole("menuitem", { name: "Switch conversation…" }).tap();
    await touchPalette.getByRole("button", { name }).tap();
  }
  await tapConversation(/^helper/);
  await phone
    .getByLabel("Transcript")
    .getByText("hello helper", { exact: true })
    .waitFor();
  await tapConversation(/^Familiar\b/i);
  await phone
    .getByLabel("Transcript")
    .getByText("Strong receipt", { exact: true })
    .waitFor();
  const editableFocus = phone.locator(
    ":is(input, textarea, [contenteditable=true]):focus",
  );
  assert.equal(await editableFocus.count(), 0, "touch palette selection");
  await phone.getByRole("button", { name: "Show sessions" }).tap();
  await phone.getByRole("link", { name: "2 older" }).tap();
  await phone
    .getByRole("searchbox", { name: "Search sessions and messages" })
    .waitFor();
  assert.equal(await editableFocus.count(), 0, "touch Sessions search");
  await phone.getByRole("button", { name: "Show sessions" }).tap();
  await phone.getByRole("button", { name: "Familiar", exact: true }).tap();
  await phone
    .getByLabel("Transcript")
    .getByText("Strong receipt", { exact: true })
    .waitFor();
  assert.equal(await editableFocus.count(), 0, "touch rail selection");
  const touchInput = phone.getByRole("textbox", { name: "Message" });
  await checkCanonicalSwipe(phone, "Second session");
  await touchInput.fill("Touch draft");
  await touchInput.press("Enter");
  assert.equal(await touchInput.inputValue(), "Touch draft\n");
  await touchInput.pressSequentially("second line");
  assert.equal(await touchInput.inputValue(), "Touch draft\nsecond line");
  await phone.getByRole("button", { name: "Send", exact: true }).tap();
  await transcript
    .getByText("Touch draft second line", { exact: true })
    .waitFor();
  // Age the answered helper only in this browser. Its parent is still recent.
  await phone.clock.fastForward("00:31:00");
  await headerPalette(phone);
  const touchQuery = touchPalette.getByRole("searchbox");
  await touchQuery.fill("helper");
  const agedHelper = touchPalette.getByRole("button", { name: /^helper\b/ });
  await agedHelper.waitFor();
  await touchQuery.fill("");
  await touchPalette
    .getByRole("button", { name: /^Second session\b/ })
    .waitFor();
  assert.equal(await agedHelper.count(), 0);
  await touch.close();
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
    await (
      await headerPalette(observer)
    )
      .getByRole("button", { name: /^Familiar\b/i })
      .click();
    await observer
      .getByLabel("Transcript")
      .getByText("Strong receipt", { exact: true })
      .waitFor();
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
    await native.emulateMedia({ colorScheme: "dark" });
    await observer.emulateMedia({ colorScheme: "dark" });
    await native.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    await pair("desktop-dark");
    await native.emulateMedia({ colorScheme: "light" });
    await observer.emulateMedia({ colorScheme: "light" });
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
    await page.getByRole("button", { name: "Familiar", exact: true }).click();
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
  await switcher.getByRole("searchbox").fill("New session");
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
    const namedMessage = observer.getByRole("textbox", { name: "Message" });
    await namedMessage.fill("steps");
    await namedMessage.press("Enter");
    await observer.getByText(/^Echo: steps/).waitFor();
    await observer.locator("[data-streaming]").waitFor({ state: "hidden" });
    await namedMessage.fill(
      `${"Historical fixture line\n".repeat(65)}Latest named receipt`,
    );
    await namedMessage.press("Enter");
    await observer.getByText(/^Echo: Historical fixture line/).waitFor();
    await observer.locator("[data-streaming]").waitFor({ state: "hidden" });
    const cold = await context.newPage();
    await cold.setViewportSize({ width: 960, height: 640 });
    const bundle = Promise.withResolvers<void>();
    const chord = Promise.withResolvers<void>();
    const socketStarted = Promise.withResolvers<void>();
    await cold.route("**/owner-sessions.js", async (route) => {
      await bundle.promise;
      await route.continue();
    });
    await cold.routeWebSocket(/.*/, async (route) => {
      socketStarted.resolve();
      await chord.promise;
      route.connectToServer();
    });
    await cold.goto(`${origin}${namedPath}`, { waitUntil: "commit" });
    const sample = () =>
      cold.getByLabel("Transcript").evaluate(async (node) => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const viewport = node.getBoundingClientRect();
        const latest = [...node.querySelectorAll("p")]
          .filter((p) => p.textContent.includes("Latest named receipt"))
          .at(-1);
        const rect = latest?.getBoundingClientRect();
        return {
          top: node.scrollTop,
          readingFocus: node.matches(":focus"),
          gap: node.scrollHeight - node.clientHeight - node.scrollTop,
          latestVisible: Boolean(
            rect &&
            rect.bottom > viewport.top &&
            rect.bottom <= viewport.bottom,
          ),
        };
      });
    await cold.getByText(/^Echo: Historical fixture line/).waitFor();
    const settled = cold.getByRole("button", {
      name: /Read a file.*Show the steps/i,
    });
    const summaryAnimation = () =>
      settled
        .first()
        .evaluate((node) => node.getAnimations({ subtree: true }).length);
    const ssrAnimation = await summaryAnimation();
    const painted = await sample();
    const timestamp = cold.locator("time[data-message-time]").first();
    const localTime = await timestamp.evaluate((node: HTMLTimeElement) => {
      const date = new Date(node.dateTime);
      return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
    });
    assert((await timestamp.innerText()).endsWith(localTime));
    assert.equal(
      await cold
        .getByRole("button", { name: "Copy message", exact: true })
        .first()
        .locator("svg rect")
        .count(),
      1,
    );
    console.log("Named SSR before browser bundle", painted);
    await cold.getByLabel("Transcript").focus();
    await cold.getByLabel("Transcript").evaluate((node) => {
      node.scrollTop = 100;
    });
    const reading = await sample();
    bundle.resolve();
    await socketStarted.promise;
    const waiting = await sample();
    const hydrationAnimation = await summaryAnimation();
    assert((await timestamp.innerText()).endsWith(localTime));
    chord.resolve();
    await cold.getByRole("button", { name: "Session tools" }).waitFor();
    await cold.waitForFunction(
      () =>
        !document.querySelector<HTMLButtonElement>(
          'button[aria-label="Session tools"]',
        )?.disabled,
    );
    const connected = await sample();
    console.log("Named history position across hydration/Chord", [
      reading.top,
      waiting.top,
      connected.top,
    ]);
    const animations = [
      ssrAnimation,
      hydrationAnimation,
      await summaryAnimation(),
    ];
    console.log(
      "Settled summary animation across SSR/hydration/Chord",
      animations,
    );
    assert.deepEqual(animations, [0, 0, 0]);
    assert(painted.latestVisible && painted.gap <= 2);
    assert.equal(waiting.top, reading.top);
    assert.equal(connected.top, reading.top);
    assert(
      reading.readingFocus && waiting.readingFocus && connected.readingFocus,
    );
    await cold.close();
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
      .getByRole("searchbox", { name: "Find a command or conversation" })
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
  const archiveControls = '#clank-sidebar button[aria-label^="Archive "]';
  assert.equal(
    await staticPage.locator(archiveControls).count(),
    0,
    "SSR is not a live owner binding",
  );
  const html = await signedIn.text();
  assert.equal(
    await staticPage.getByLabel("Transcript").evaluate(receiptProblem, html),
    null,
    "raw response markup",
  );
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
  assertNoCredentials(html);
  await noJs.close();
  const hydrated = await context.newPage();
  await hydrated.setViewportSize({ width: 1280, height: 800 });
  await hydrated.addInitScript(() => {
    const shifts: number[] = [];
    Object.assign(window, { clankShifts: shifts });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[]) {
        if (!entry.hadRecentInput) shifts.push(entry.value);
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  const geometry = () =>
    hydrated.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return {
        boxes: [
          "main",
          ".session-detail",
          '[aria-label="Transcript"]',
          "textarea",
          '[aria-label="Composer metadata"]',
        ].map((selector) => {
          const rect = document
            .querySelector(selector)
            ?.getBoundingClientRect();
          return rect && [rect.x, rect.y, rect.width, rect.height];
        }),
        fonts: performance
          .getEntriesByType("resource")
          .filter((entry) => /\.(woff2?|ttf)(\?|$)/.test(entry.name)).length,
        shifts: (window as Window & { clankShifts?: number[] }).clankShifts,
      };
    });
  const script = Promise.withResolvers<void>();
  const check = Promise.withResolvers<void>();
  const checkStarted = Promise.withResolvers<void>();
  await hydrated.route("**/owner-sessions.js", async (route) => {
    await script.promise;
    await route.continue();
  });
  await hydrated.route("**/owner/check", async (route) => {
    checkStarted.resolve();
    await check.promise;
    await route.continue();
  });
  await hydrated.goto(origin, { waitUntil: "commit" });
  await hydrated.getByText("Strong receipt", { exact: true }).waitFor();
  const hydratedTranscript = hydrated.getByLabel("Transcript");
  assert.equal(
    await hydratedTranscript.evaluate(receiptProblem),
    null,
    "bundle held",
  );
  const ssrStrong = await hydratedTranscript
    .locator("strong")
    .filter({ hasText: /^Strong receipt$/ })
    .evaluateHandle((node) => node);
  const ssrGeometry = await geometry();
  console.log("SSR geometry", JSON.stringify(ssrGeometry));
  script.resolve();
  await checkStarted.promise;
  assert.equal(
    await hydratedTranscript.evaluate(receiptProblem),
    null,
    "hydrated, owner check held",
  );
  assert.equal(
    await hydrated.locator(archiveControls).count(),
    0,
    "owner check held",
  );
  const hydratedGeometry = await geometry();
  assert.deepEqual(hydratedGeometry.boxes, ssrGeometry.boxes);
  check.resolve();
  await hydrated.waitForFunction(
    () =>
      document.querySelector<HTMLButtonElement>('button[aria-label="Send"]')
        ?.disabled === true &&
      !document.querySelector<HTMLTextAreaElement>("textarea")?.disabled,
  );
  await hydrated.getByText("Strong receipt", { exact: true }).waitFor();
  await hydrated.waitForFunction(() => {
    const node = document.querySelector('[aria-label="Transcript"]');
    return node && node.scrollHeight - node.clientHeight - node.scrollTop <= 2;
  });
  await hydrated.getByRole("button", { name: "Session tools" }).waitFor();
  await hydrated.waitForFunction(
    () =>
      !document.querySelector<HTMLButtonElement>(
        'button[aria-label="Session tools"]',
      )?.disabled,
  );
  const liveGeometry = await geometry();
  assert(
    await hydrated.evaluate(() => document.activeElement === document.body),
  );
  assert.deepEqual(liveGeometry.boxes, ssrGeometry.boxes);
  assert(
    (liveGeometry.shifts ?? []).reduce((sum, shift) => sum + shift, 0) < 0.01,
  );
  console.log("Live geometry", JSON.stringify(liveGeometry));
  assert.equal(
    await hydratedTranscript.evaluate(receiptProblem),
    null,
    "connected",
  );
  assert(
    await ssrStrong.evaluate((node) => node.isConnected),
    "SSR strong node replaced during hydration or live connection",
  );
  await ssrStrong.dispose();
  const hydratedJump = hydrated.getByRole("button", { name: "Jump to latest" });
  await hydratedTranscript.evaluate((node) => {
    node.scrollTop = 0;
  });
  await hydratedJump.waitFor();
  // Explicitly reselecting the open conversation moves focus, not the reader.
  const position = () =>
    hydratedTranscript.evaluate((node) => [scrollX, scrollY, node.scrollTop]);
  const readingPosition = await position();
  await hydrated
    .getByRole("complementary", { name: "Session list" })
    .getByRole("button", { pressed: true, name: "Familiar", exact: true })
    .press("Enter");
  await hydrated
    .getByRole("textbox", { name: "Message" })
    .and(hydrated.locator(":focus"))
    .waitFor();
  assert.deepEqual(await position(), readingPosition);
  await hydrated
    .getByRole("button", { name: "Second session", exact: true })
    .click();
  await hydrated.getByText("No messages yet.").waitFor();
  await hydratedJump.waitFor({ state: "hidden" });
  await hydrated.getByRole("button", { name: "Familiar", exact: true }).click();
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
      (item) => item.querySelector("button")?.title === "Age hours",
    );
    return (
      row && Array.from(row.parentElement!.children).indexOf(row) < original
    );
  }, originalIndex);
  assert(await movingRow.evaluate((node) => node === document.activeElement));
  const catalogState = () =>
    fixture.server.host.root(
      async (ctx) =>
        (await ctx.get(Catalog, {})).sessions.value.map(
          ({ id, main, title: sessionTitle, archivedAt }) => ({
            id,
            main,
            title: sessionTitle,
            archivedAt,
          }),
        ),
      TEST,
    );
  const before = await catalogState();
  const victim = before.find((s) => s.title === "Second session");
  assert(victim && victim.archivedAt === null);
  const pi = new URL(`http://127.0.0.1:${fixture.server.port}`);
  const nativeRail = await context.newPage();
  nativeRail.setDefaultTimeout(8000);
  await nativeRail.setViewportSize(hydrated.viewportSize()!);
  await nativeRail.goto((await mintOwnerLink(pi, fixture.dataDir, pi)).href);
  await nativeRail.waitForURL(pi.href);
  await nativeRail.goto(new URL(`/s/${session.id}`, pi).href);
  await nativeRail.getByRole("textbox", { name: "Message" }).waitFor();
  await proveRailArchive(hydrated, observer, nativeRail, {
    fixture,
    piRoot,
    id: victim.id,
    main: victim.main,
  });
  await nativeRail.close();
  const after = await catalogState();
  assert.equal(
    typeof after.find((s) => s.id === victim.id)?.archivedAt,
    "number",
  );
  const active = (rows: typeof before) =>
    rows
      .filter((s) => s.archivedAt === null)
      .map((s) => s.id)
      .toSorted();
  assert.deepEqual(
    active(after),
    active(before).filter((id) => id !== victim.id),
  );
  await hydrated.close();
  // Omit the cookie on the document fetch only to exercise the SSR-miss shell.
  const shellContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 375, height: 667 },
  });
  const shellPage = await shellContext.newPage();
  const releaseCheck = Promise.withResolvers<void>();
  await shellPage.route("**/owner/check", async (route) => {
    await releaseCheck.promise;
    await route.continue();
  });
  await shellPage.goto(origin);
  const rail = shellPage.getByRole("complementary", { name: "Session list" });
  await rail.getByText("Connecting to Pi…").waitFor();
  const railBox = await rail.boundingBox();
  assert.equal(await shellPage.getByLabel("Session detail").isVisible(), false);
  await shellContext.addCookies(await context.cookies(origin));
  releaseCheck.resolve();
  await rail.getByRole("button", { name: "Familiar", exact: true }).waitFor();
  assert.deepEqual(await rail.boundingBox(), railBox);
  if (namedPath) {
    await shellContext.clearCookies();
    const authenticate = Promise.withResolvers<void>();
    await shellPage.unroute("**/owner/check");
    await shellPage.route("**/owner/check", async (route) => {
      await authenticate.promise;
      await route.continue();
    });
    await shellPage.goto(`${origin}${namedPath}`);
    const detail = shellPage.getByLabel("Session detail");
    await detail.getByText("Opening conversation…").waitFor();
    assert.equal(await detail.getByLabel("Transcript").count(), 0);
    await shellContext.addCookies(await context.cookies(origin));
    authenticate.resolve();
    await detail.getByText(/^Echo: Historical fixture line/).waitFor();
    await detail
      .getByText("Opening conversation…")
      .waitFor({ state: "hidden" });
  }
  await shellContext.close();
  const startServer = (
    await import(new URL("src/hosts/server.ts", piRoot).href)
  ).startServer;
  const restartName = "Disposable restart mark";
  const restartOwner = fixture.client({ Cookie: fixture.owner.cookie });
  try {
    await restartOwner.host.root(async (ctx) => {
      const brand = await ctx.get(ThemeBranding, {});
      await brand.setName({ name: restartName }, ctx);
      await brand.setTint({ tint: 217 }, ctx);
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>';
      await brand.setLogo({ base64: Buffer.from(svg).toString("base64") }, ctx);
    }, TEST);
  } finally {
    await restartOwner.host.close(TEST);
  }
  const restartIcon = page
    .locator('#clank-sidebar img[src^="data:image/png;base64,"]')
    .first();
  const restartSrc = await restartIcon.getAttribute("src");
  assert(restartSrc);
  const continuity = await page.evaluateHandle(inspectBrand, {
    name: restartName,
    src: restartSrc,
    liveName: restartName,
  });
  const heading = page.locator("#clank-detail h1");
  const headingBox = await heading.boundingBox();
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
  await page.waitForResponse(
    (r) => r.url() === `${origin}/owner/check` && r.status() === 502,
  );
  assert.equal(
    await continuity.evaluate((s) => s.missing),
    null,
    "owner branding through failed retry",
  );
  assert.deepEqual(await heading.boundingBox(), headingBox);
  const toolsBox = await tools.boundingBox();
  const badge = await page.getByText("Offline", { exact: true }).boundingBox();
  assert(toolsBox && badge && badge.x >= toolsBox.x + toolsBox.width);

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
  assert.equal(
    await continuity.evaluate((s) => s.missing),
    null,
    "owner branding through rebind",
  );
  await continuity.dispose();
  assert.deepEqual(await heading.boundingBox(), headingBox);

  await jump.waitFor();
  assert.equal(await transcript.evaluate((node) => node.scrollTop), restartTop);
  assert.equal(await message.inputValue(), draft);
  assert.equal(await transcript.getByText(draft, { exact: true }).count(), 0);
  await message.fill("");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  await transcript
    .getByRole("button", { name: "Copy message", exact: true })
    .first()
    .click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    prompt,
  );
  await transcript
    .getByRole("button", { name: "Edit message", exact: true })
    .first()
    .click();
  await page.waitForFunction(
    (expected) =>
      document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Message"]',
      )?.value === expected,
    prompt,
  );
  await transcript.getByText("No messages yet.").waitFor();
  assert.equal(
    await page.evaluate(
      async () => (await fetch("/owner/logout", { method: "POST" })).status,
    ),
    200,
  );
  await page.getByLabel("One-time token").waitFor();
  assert.equal(await page.getByLabel("Transcript").count(), 0);
  await observer.getByLabel("One-time token").waitFor();
  assert.equal(await page.title(), "Clank");
  assert.equal(
    await page
      .locator("html[data-pi-tint], link[rel~=icon], #clank-sidebar img")
      .count(),
    0,
  );
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
