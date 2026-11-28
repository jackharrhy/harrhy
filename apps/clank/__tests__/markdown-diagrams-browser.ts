// From apps/clank: node __tests__/markdown-diagrams-browser.ts (local Chromium).
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { markdownHtml } from "../app/conversation/markdown-renderer.ts";

const source = 'flowchart LR\n  A["🧪 &amp; <tag>"] --> B \n';
const fence = (code: string) => "~~~mermaid\n" + code + "~~~";
const text = fence(source) + "\n\n```js\nother code\n```";
const client = await build({
  stdin: {
    contents: `
    import { createRoot } from 'remix/component';
    import { jsx } from 'remix/component/jsx-runtime';
    import { Markdown } from './app/conversation/markdown.tsx';
    const root = createRoot(document.querySelector('main'));
    window.render = (text, streaming) => root.render(jsx(Markdown, {text, streaming}));`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  tsconfig: "tsconfig.json",
});
declare global {
  interface Window {
    render(text: string, streaming: boolean): void;
  }
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const origin = "http://localhost";
  const page = await browser.newPage();
  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(origin + "/", (r) =>
    r.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<main><div data-markdown="root">${markdownHtml(text, false)}</div></main>`,
    }),
  );
  const bodies: string[] = [];
  const first = Promise.withResolvers<void>();
  await page.route(origin + "/owner/diagram", async (r) => {
    const req = r.request();
    assert.equal(req.method(), "POST");
    assert.equal(req.headers()["content-type"], "text/plain; charset=utf-8");
    bodies.push(req.postData()!);
    if (bodies.length === 1) await first.promise;
    await r.fulfill({
      json: {
        svg:
          req.postData() === source
            ? '<svg role="img" aria-label="Mermaid diagram; source follows"><title>Proof</title></svg>'
            : null,
      },
    });
  });
  await page.goto(origin);
  const code = page.locator('[data-language="mermaid"] pre code');
  assert.equal(await code.textContent(), source);
  const ssrCode = await code.elementHandle();
  await page.addScriptTag({ content: client.outputFiles[0]!.text });
  const render = (next: string, streaming: boolean) =>
    page.evaluate(([s, active]) => window.render(s, active), [
      next,
      streaming,
    ] as const);
  const request = page.waitForRequest(origin + "/owner/diagram");
  await render(text, false);
  await request;
  assert.equal(await code.isVisible(), true);
  first.resolve();
  const disclosure = page.getByLabel("Diagram source", { exact: true });
  await disclosure.focus();
  await disclosure.press("Enter");
  assert(await code.evaluate((el, ssr) => el === ssr, ssrCode));
  const copy = page.locator('.harrhy-diagram button[data-code-action="copy"]');
  await copy.focus();
  await copy.press("Space");
  await page.waitForFunction(
    async (s) => (await navigator.clipboard.readText()) === s,
    source,
  );
  assert.deepEqual(bodies, [source]);

  // Words may reuse its committed prefix on append. The old decoration must
  // come off before that patch, without stealing the following block's copy.
  await render(text + "\n\n~~~mermaid\nflowchart", true);
  await page.locator("[data-streaming] [data-incomplete]").waitFor();
  assert.equal(await disclosure.count(), 0);
  const later = "flowchart TB\n  X --> Y\n";
  const appended = text + "\n\n" + fence(later);
  await render(appended, true);
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '[data-streaming] [data-language="mermaid"]:not([data-incomplete])',
      ).length === 2,
  );
  assert.deepEqual(bodies, [source]);
  const fallback = page.waitForResponse(
    (r) =>
      r.url() === origin + "/owner/diagram" && r.request().postData() === later,
  );
  await render(appended, false);
  await disclosure.waitFor();
  await fallback;
  await page.locator('[data-language="js"] button').click();
  await page.waitForFunction(
    async () => (await navigator.clipboard.readText()) === "other code\n",
  );
  assert.deepEqual(bodies, [source, source, later]);
  assert.equal(await code.nth(1).textContent(), later);
  assert.equal(await code.nth(1).isVisible(), true);
  // An over-limit body consumes a candidate slot but is never submitted.
  // A ninth fence and an EOF-open fence must remain ordinary source too.
  const limited = ["x".repeat(10_000) + "\n", ...Array<string>(8).fill(source)];
  await page.locator("[data-language=js] button").blur();
  await render(limited.map(fence).join("\n\n"), false);
  await page.waitForFunction(
    () => document.querySelectorAll(".harrhy-diagram").length === 7,
  );
  assert.equal(await code.count(), 9);
  assert.equal(await code.last().isVisible(), true);
  assert.deepEqual(bodies.slice(3), Array<string>(7).fill(source));
  await render("~~~mermaid\nflowchart LR\n  A --> B", false);
  await page.waitForFunction(
    () => document.querySelectorAll("pre code").length === 1,
  );
  assert.equal(await code.isVisible(), true);
  assert.equal(bodies.length, 10);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
