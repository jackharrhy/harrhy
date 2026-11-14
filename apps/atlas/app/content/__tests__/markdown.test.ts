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

test("preserves GFM, safe details and local links for backlink resolution", async () => {
  const result = await renderMarkdown(`# Heading

| Name | Value |
| --- | ---: |
| ~~old~~ | **new** |

- [x] Finished
- [ ] Pending

<details open><summary>More</summary><p>Details body</p></details>

[relative](../other.md#section) [root](/other) [again](/other)
[web](https://example.com) <a href="/raw">raw</a>
`);
  assert.match(result.html, /<h1 id="heading-heading">Heading<\/h1>/);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /<del>old<\/del>/);
  assert.match(
    result.html,
    /<details open><summary>More<\/summary><p>Details body<\/p><\/details>/,
  );
  assert.match(result.html, /\[x\] Finished/);
  assert.match(result.html, /\[ \] Pending/);
  assert.doesNotMatch(result.html, /<input\b/);
  assert.match(result.text, /\[x\] Finished/);
  assert.match(result.text, /\[ \] Pending/);
  assert.deepEqual(result.links, [
    "../other.md#section",
    "/other",
    "https://example.com",
    "/raw",
  ]);
  assert.match(result.text, /Details body/);
});

test("highlights fenced code after sanitizing and tolerates unknown languages", async () => {
  const result = await renderMarkdown(
    '```typescript\nconst answer: number = 42;\n```\n\n```not-a-real-language\n<safe>\n```\n\n<span style="color:red">author</span>',
  );
  assert.match(result.html, /class="shiki/);
  assert.match(result.html, /style="color:/);
  assert.match(result.html, /(?:&lt;|&#x3C;)safe(?:&gt;|>)/);
  assert.match(result.html, /<span>author<\/span>/);
  assert.doesNotMatch(result.html, /style="color:red"/);
  assert.match(result.text, /const answer: number = 42;/);
});
