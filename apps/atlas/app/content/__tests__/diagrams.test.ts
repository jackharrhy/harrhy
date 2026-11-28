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

test("only the first eight Mermaid fences render; all nine stay outside quotes", async () => {
  const source = "flowchart TD\n Reader --> Source";
  const fence = "```mermaid\n" + source + "\n```";
  const result = await renderMarkdown(
    ["Before", ...Array<string>(9).fill(fence), "After"].join("\n\n"),
  );
  assert.equal(result.html.match(/class="harrhy-diagram"/g)?.length, 8);
  assert.equal(
    result.html.match(/<summary>Diagram source<\/summary>/g)?.length,
    8,
  );
  assert.equal(result.html.match(/data-atlas-diagram/g)?.length, 9);
  assert.equal(
    result.annotationText.trim().replace(/\s+/g, " "),
    "Before After",
  );
  const fallback = result.html.slice(
    result.html.lastIndexOf("<pre"),
    result.html.lastIndexOf("</pre>"),
  );
  assert.match(fallback, /data-atlas-diagram/);
  assert.equal(fallback.replace(/<[^>]+>/g, ""), source + "\n");
});
