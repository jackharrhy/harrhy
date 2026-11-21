import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "../markdown.ts";

test("diagram links, images, callbacks and authored SVG never acquire browser capabilities", async () => {
  const result = await renderMarkdown(
    '```mermaid\nflowchart LR\n A[Draft] --> B[Publish]\n click A "https://example.test/leak"\n click B call alert()\n```\n\n<svg onload="alert(1)"><text>Injected</text></svg>',
  );
  assert.match(result.html, /<svg/);
  assert.doesNotMatch(
    result.html,
    /<a\b|<image\b|onload=|onclick=|<script\b|Injected/,
  );
  assert.equal(result.html.match(/<svg/g)?.length, 1);
  const geometry = result.html.slice(
    result.html.indexOf("<svg"),
    result.html.indexOf("</svg>"),
  );
  assert.doesNotMatch(
    geometry,
    /url\(|https:|style=|class=|href=|<(?:a|image)(?=[\s/>])/,
  );
  assert.deepEqual(result.links, []);
});
