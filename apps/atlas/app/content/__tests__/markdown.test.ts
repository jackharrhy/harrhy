import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "../markdown.ts";

test("removes active HTML, author styles, tracking images and unsafe URLs", async () => {
  const result = await renderMarkdown(`
<script>alert('script')</script>
<style>body { display:none }</style>
<iframe src="https://tracker.example">iframe secret</iframe>
<svg><a href="javascript:alert(1)">svg secret</a></svg>
<form action="https://tracker.example"><button>submit secret</button></form>
<p style="background:url(https://tracker.example)" onclick="alert(1)">Visible</p>
<a href="jav&#x61;script:alert(1)">unsafe</a>
<a href="data:text/html,evil">data</a>
<a href="vbscript:evil">vbscript</a>
<img src="https://tracker.example/pixel" onerror="alert(1)">

![remote](https://tracker.example/markdown.png)

![local](/local.png)

<picture><source srcset="https://tracker.example/pixel"><img src="/local.png"></picture>
`);
  assert.doesNotMatch(
    result.html,
    /<(script|style|iframe|svg|form|button|img|picture|source)\b/i,
  );
  assert.doesNotMatch(
    result.html,
    /onclick|onerror|style=|javascript:|vbscript:|data:text|tracker\.example/i,
  );
  assert.doesNotMatch(
    result.text,
    /alert\('script'\)|iframe secret|svg secret|submit secret/,
  );
  assert.match(result.text, /Visible/);
  assert.deepEqual(result.links, []);
});

test("annotation projection preserves UTF-16 text and code whitespace without widget markers", async () => {
  const result = await renderMarkdown(
    "A **bold** 🦊 quote.\n\n[[widget:example]]\n\n```text\n  first\n    second\n```\n\n<details><summary>More</summary>Hidden quote</details>",
  );
  assert.match(result.annotationText, /A bold 🦊 quote\./);
  assert.match(result.annotationText, /  first\n    second/);
  assert.match(result.annotationText, /MoreHidden quote/);
  assert.doesNotMatch(result.annotationText, /widget:example/);
  assert.match(result.html, /\[\[widget:example\]\]/);
});
