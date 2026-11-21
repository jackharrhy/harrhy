import assert from "node:assert/strict";
import { build } from "esbuild";
const { chromium } = await import(process.env.HARRHY_ATLAS_PLAYWRIGHT ?? "@playwright/test");
const bundle = await build({
  stdin: {
    contents:
      'export * from "./app/comments/fragments.ts"; export * from "./app/comments/projection.ts";',
    resolveDir: new URL("../", import.meta.url).pathname,
    sourcefile: "fragment-proof.ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "AtlasProof",
  platform: "browser",
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  await page.setContent(
    '<article id="article"><h1>Title 🦊</h1>\n<h2>Repeated heading</h2>\n<p>Heading body <code>inline</code></p>\n<h2>Repeated heading</h2>\n<p>Before 🦊 <strong>bold</strong> <a href="#native">link</a>.</p>\n<p>Second paragraph with é.</p><pre><code>  first\n\tsecond\n</code></pre><table><tbody><tr><td>cell</td></tr></tbody></table><details><summary>More</summary>Hidden quote</details><section data-atlas-widget>Excluded <button>Widget control</button></section><div data-atlas-diagram><svg><text>Diagram geometry label</text></svg><details><summary>Diagram source</summary><pre><code>flowchart LR A --> B</code></pre></details></div></article>',
  );
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => {
    const {
      projectArticle,
      restoreQuote,
      captureQuote,
      renderCommentFragments,
      clearCommentFragments,
      commentIdsAtTarget,
    } = AtlasProof;
    const root = document.querySelector("article"),
      link = root.querySelector("a"),
      control = root.querySelector("button");
    const original = projectArticle(root).text;
    let linkClicks = 0;
    link.addEventListener("click", () => linkClicks++);
    function quote(exact) {
      const start = original.indexOf(exact);
      if (start < 0) throw Error("Missing proof quote");
      const end = start + exact.length;
      return {
        start,
        end,
        exact,
        prefix: original.slice(Math.max(0, start - 64), start),
        suffix: original.slice(end, end + 64),
      };
    }
    const cross = quote("🦊 bold link.\nSecond paragraph"),
      overlap = quote("bold link"),
      code = quote("  first\n\tsecond\n"),
      hidden = quote("Hidden quote"),
      title = quote("Title 🦊\nRepeated heading"),
      headingBody = quote("Repeated heading\nHeading body inline"),
      repeated = {
        ...quote("Repeated heading"),
        start: original.lastIndexOf("Repeated heading"),
        end: original.lastIndexOf("Repeated heading") + "Repeated heading".length,
      };
    repeated.prefix = original.slice(Math.max(0, repeated.start - 64), repeated.start);
    repeated.suffix = original.slice(repeated.end, repeated.end + 64);
    const marks = [
      { id: "cross", quote: cross },
      { id: "overlap", quote: overlap },
      { id: "code", quote: code },
      { id: "hidden", quote: hidden },
      { id: "title", quote: title },
      { id: "heading-body", quote: headingBody },
      { id: "repeated", quote: repeated },
    ];
    const diagramRange = document.createRange();
    diagramRange.selectNodeContents(root.querySelector("[data-atlas-diagram]"));
    const checks = [
      !original.includes("Diagram geometry label"),
      !original.includes("flowchart LR"),
      captureQuote(root, diagramRange) === undefined,
    ];
    for (let i = 0; i < 5; i++) {
      renderCommentFragments(root, marks);
      checks.push(projectArticle(root).text === original);
      for (const evidence of [title, headingBody, repeated, code, hidden])
        checks.push(captureQuote(root, restoreQuote(root, evidence)).exact === evidence.exact);
      checks.push(captureQuote(root, restoreQuote(root, cross)).exact === cross.exact);
      checks.push(root.querySelector("a") === link && root.querySelector("button") === control);
      checks.push(!root.querySelector("[data-atlas-widget] [data-atlas-comment-fragment]"));
      checks.push(!root.querySelector("[data-atlas-diagram] [data-atlas-comment-fragment]"));
    }
    const overlapFragment = [...root.querySelectorAll("[data-atlas-comment-fragment]")].find(
      (node) => node.dataset.atlasCommentIds.includes("overlap") && !node.closest("a"),
    );
    checks.push(commentIdsAtTarget(root, overlapFragment).sort().join(",") === "cross,overlap");
    checks.push(
      commentIdsAtTarget(root, overlapFragment.firstChild).sort().join(",") === "cross,overlap",
    );
    checks.push(commentIdsAtTarget(root, link).length === 0);
    link.click();
    checks.push(linkClicks === 1);
    const stale = { ...cross, exact: "X" + cross.exact.slice(1) };
    checks.push(restoreQuote(root, stale) === undefined);
    clearCommentFragments(root);
    checks.push(
      root.querySelectorAll("[data-atlas-comment-fragment]").length === 0 &&
        projectArticle(root).text === original,
    );
    return checks;
  });
  assert.ok(result.every(Boolean), "fragment projection/identity/overlap/native-link invariants");
  console.log(
    "PASS fragment wrapping: exact UTF16/multi-paragraph/code/details/overlaps/identity/widgets/stale anchors",
  );
} finally {
  await browser.close();
}
