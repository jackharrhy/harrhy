import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { createAtlas } from "../app/router.tsx";
const { chromium } = await import(process.env.HARRHY_ATLAS_PLAYWRIGHT ?? "@playwright/test");
const root = await mkdtemp(path.join(tmpdir(), "atlas-navigation-"));
const browser = await chromium.launch({ headless: true });
let server;
try {
  const spaces = Array.from({ length: 16 }, (_, i) => ({
    id: `agent-${i}`,
    name: i === 0 ? "Alpha" : `Agent ${i} with a longer title`,
    directory: `agent-${i}`,
  }));
  for (const space of spaces) await mkdir(path.join(root, space.directory));
  async function page(name, title, route, body, parent) {
    await writeFile(
      path.join(root, spaces[0].directory, `${name}.md`),
      `---\ntitle: ${JSON.stringify(title)}\npath: ${route}\n${parent ? `parent: ${parent}\n` : ""}---\n${body}\n`,
    );
  }
  await page(
    "index",
    "Alpha introduction",
    "/",
    "Concise introduction with curated links. [Guide](/guide/)",
  );
  await page("guide", "Operations: last 72 hours (15 Nov 2026)", "/guide/", "Read the guide.");
  const referenceTitle = "Production routing: source audit";
  await page("reference", referenceTitle, "/guide/reference/", "Read the reference.");
  const longTitle = "Exact leaf & safe <title> with a deliberately long name to test wrapping";
  await page(
    "leaf",
    longTitle,
    "/guide/reference/leaf/",
    `## Passage\n\n${"A long article paragraph with real words for scrolling.\n\n".repeat(65)}\n| Field | ${" Column |".repeat(15)}\n| --- | ${" --- |".repeat(15)}\n| ${"wide".repeat(35)} | ${" Value |".repeat(15)}`,
    "/guide/reference/",
  );
  await page("archive", "Other branch", "/archive/", "Other published parent.");
  await page("archive-leaf", "Other child", "/archive/leaf/", "Other published leaf.");
  for (let i = 0; i < 45; i++)
    await page(
      `other-${i}`,
      `Other document ${String(i).padStart(2, "0")}`,
      `/other-${i}/`,
      "Published page.",
    );
  await writeFile(path.join(root, "atlas.json"), JSON.stringify({ spaces }));
  const atlas = await createAtlas(root, path.join(root, "atlas.json"));
  const errors = [];
  server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, "GET", "navigation fixture has no mutations");
      const result = await atlas.router.fetch(
        new Request(`http://${request.headers.host}${request.url}`, { headers: request.headers }),
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      errors.push(String(error));
      response.writeHead(500).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext();
  const tab = await context.newPage();
  tab.on("pageerror", (error) => errors.push(error.message));
  await tab.goto(base + "/");
  const icon = tab.locator("link[rel=icon]");
  assert.equal(await icon.getAttribute("type"), "image/svg+xml");
  const iconTab = await context.newPage();
  const iconResponse = await iconTab.goto(base + (await icon.getAttribute("href")));
  assert.equal(iconResponse.status(), 200);
  assert.match(iconResponse.headers()["content-type"], /^image\/svg\+xml/);
  assert.match(await iconResponse.text(), /🌎/);
  await iconTab.close();
  for (const theme of ["clean", "tactile", "brutalist"]) {
    for (const width of [1920, 1440, 1024, 390]) {
      await tab.setViewportSize({ width, height: 900 });
      await tab.goto(`${base}/spaces/agent-0/guide/reference/leaf/?theme=${theme}#heading-passage`);
      await tab.getByRole("heading", { level: 1, name: longTitle, exact: true }).waitFor();
      assert.equal(await tab.locator("h1").count(), 1);
      assert.equal(await tab.title(), `${longTitle} - Atlas`);
      assert.equal(await tab.getByRole("searchbox").count(), 0);
      assert.equal(await tab.locator('a[href*="/search/"]').count(), 0);
      assert.equal(
        await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `${theme}/${width} overflow`,
      );
      assert.equal(
        await tab
          .getByRole("button", { name: "Settings", exact: true })
          .getAttribute("popovertarget"),
        "settings",
      );
      assert.equal(await tab.locator("main > p a").count(), 0, "redundant breadcrumbs removed");
      const tree = tab.locator(
        width > 1280 ? ".atlas-desktop-directory" : ".atlas-mobile-directory",
      );
      if (width <= 1280) await tree.locator(":scope > summary").click();
      assert.equal(
        await tree.locator("nav details:not([open])").count(),
        0,
        "all page groups are SSR-open",
      );
      for (const summary of await tree.locator("nav details > summary").all()) {
        const arrow = await summary.locator(":scope > svg").boundingBox();
        const label = await summary.locator(":scope > a").boundingBox();
        const type = await summary.locator(":scope > a").evaluate((node) => ({
          line: parseFloat(getComputedStyle(node).lineHeight),
          padding: parseFloat(getComputedStyle(node).paddingTop),
        }));
        assert.ok(
          Math.abs(arrow.y + arrow.height / 2 - (label.y + type.padding + type.line / 2)) < 2,
          "chevron aligns with first label line",
        );
        assert.ok(arrow.x + arrow.width <= label.x, "only label column wraps");
      }
      const firstSummary = tree.locator("nav details > summary").first();
      await firstSummary.focus();
      await firstSummary.press("Enter");
      assert.equal(
        await firstSummary.evaluate((node) => node.parentElement.open),
        false,
        "native summary toggles independently of route link",
      );
      await firstSummary.press("Enter");
      if (width <= 1280) await tree.locator(":scope > summary").click();
      const articleBox = await tab.locator("main").boundingBox();
      assert.ok(
        Math.abs(articleBox.x + articleBox.width / 2 - width / 2) <= 2,
        `${theme}/${width} article stays viewport-centered`,
      );
      if (width > 800) {
        const roster = tab.getByRole("navigation", { name: "Agent spaces", exact: true });
        const box = await roster.boundingBox();
        assert.ok(Math.abs(box.x + box.width / 2 - width / 2) <= 2, "roster is viewport-centered");
        const currentLink = roster.locator('a[aria-current="page"]');
        await currentLink.hover();
        const rail = await roster.evaluate((node) => ({
          border: getComputedStyle(node).borderBottomWidth,
          header: getComputedStyle(node.closest("header")).borderBottomWidth,
        }));
        assert.deepEqual(rail, { border: "1px", header: "0px" });
        assert.equal(
          await currentLink.evaluate((node) => getComputedStyle(node).textDecorationLine),
          "none",
        );
        assert.equal(
          await currentLink.evaluate((node) => getComputedStyle(node).borderBottomWidth),
          "3px",
        );
      }
      if (width > 1280) {
        const nav = tab.locator(".atlas-desktop-directory");
        assert.equal(
          await nav
            .getByRole("link", { name: longTitle, exact: true })
            .getAttribute("aria-current"),
          "page",
        );
        assert.equal(await nav.locator("nav details[open]").count(), 3);
        const table = tab.getByRole("region", { name: "Markdown table" });
        const prose = await tab.locator("h1").boundingBox();
        const expanded = await table.boundingBox();
        assert.ok(expanded.width > prose.width + 30, "table uses the right gutter");
        assert.ok(expanded.x >= prose.x - 1, "table clears the open directory");
        const toggle = nav.locator(":scope > summary");
        await toggle.focus();
        await toggle.press("Enter");
        assert.equal(await nav.locator("nav").isVisible(), false);
        const collapsed = await table.boundingBox();
        assert.ok(collapsed.x < expanded.x && collapsed.width > expanded.width + 30);
        assert.ok(Math.abs(collapsed.x + collapsed.width / 2 - width / 2) < 2);
        assert.ok(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.ok(
          await table.evaluate((node) => {
            node.scrollLeft = node.scrollWidth;
            return node.scrollLeft > 0;
          }),
          "excess columns scroll inside the table region",
        );
        await toggle.press("Enter");
        assert.equal(await nav.locator("nav").isVisible(), true);
        await tab.evaluate(() => scrollTo(0, 300));
        const before = await nav.boundingBox();
        await tab.evaluate(() => scrollBy(0, 700));
        const after = await nav.boundingBox();
        assert.ok(
          Math.abs(after.y - before.y) < 2,
          "directory remains sticky while article scrolls",
        );
        assert.ok(
          await nav.evaluate((node) => node.scrollHeight > node.clientHeight),
          "long directory scrolls independently",
        );
        const header = tab.getByRole("navigation", { name: "Agent spaces", exact: true });
        assert.ok(
          await header.evaluate((node) => node.scrollWidth > node.clientWidth),
          "large roster scrolls rather than wrapping",
        );
        const heights = await header
          .locator("a")
          .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
        assert.equal(new Set(heights).size, 1);
      } else if (width <= 800) {
        assert.equal(
          await tab.getByRole("navigation", { name: "Agent spaces", exact: true }).isVisible(),
          false,
        );
        const picker = tab.getByRole("combobox", { name: "Agent space", exact: true });
        assert.equal(await picker.inputValue(), "agent-0");
        await picker.focus();
        assert.equal(await picker.evaluate((node) => node === document.activeElement), true);
        const documents = tab.locator(".atlas-mobile-directory > summary");
        await documents.focus();
        await documents.press("Enter");
        await tab
          .locator(".atlas-mobile-directory")
          .getByRole("link", { name: referenceTitle, exact: true })
          .click();
        await tab.waitForURL("**/spaces/agent-0/guide/reference/");
        await picker.selectOption("agent-1");
        await tab.waitForURL("**/spaces/agent-1/");
        assert.equal(await tab.getByRole("heading", { level: 1 }).innerText(), spaces[1].name);
        await tab.goto(`${base}/spaces/agent-0/guide/reference/leaf/?theme=${theme}`);
      }
      await tab.locator("[data-atlas-space-picker][data-enhanced]").waitFor({ state: "attached" });
      await tab.evaluate(() => scrollTo(0, 0));
      await tab.screenshot({ path: `/tmp/atlas-navigation-${theme}-${width}.png` });
    }
  }
  const native = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });

  const noJs = await native.newPage();
  await noJs.goto(`${base}/`);
  assert.equal(new URL(noJs.url()).pathname, "/spaces/agent-0/");
  assert.equal(await noJs.getByRole("link", { name: "All spaces", exact: true }).count(), 0);
  await noJs.goto(`${base}/spaces/agent-0`);
  assert.equal(await noJs.locator("h1").innerText(), "Alpha introduction");
  assert.equal(await noJs.title(), "Alpha introduction - Atlas");
  assert.equal(
    await noJs.getByRole("combobox", { name: "Agent space", exact: true }).inputValue(),
    "agent-0",
  );
  await noJs.locator(".atlas-mobile-directory > summary").click();
  assert.equal(
    await noJs.locator(".atlas-mobile-directory nav details:not([open])").count(),
    0,
    "all groups start open without JavaScript even at index",
  );
  assert.equal(
    await noJs
      .locator(".atlas-mobile-directory")
      .getByRole("link", { name: "Alpha introduction", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  await noJs.getByRole("combobox", { name: "Agent space", exact: true }).selectOption("agent-1");
  await noJs.getByRole("button", { name: "Open", exact: true }).click();
  await noJs.waitForURL("**/spaces/agent-1/");
  assert.deepEqual(errors, []);
  console.log(
    "PASS directory hierarchy/current ancestors/stickiness/long roster/mobile native picker/no-JS/three themes and widths",
  );
  atlas.close();
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
