import assert from "node:assert/strict";
import { test } from "node:test";
import { createHtmlRenderer } from "@pierre/words/html";
import { markdownHtml, markdownOptions } from "../owner/markdown-renderer.ts";

test("only absolute HTTP(S) and mailto links get destinations", () => {
  for (const url of [
    "http://example.test/a",
    "https://example.test/b",
    "mailto:user@example.test",
  ]) {
    const html = markdownHtml(`[visit](${url})`, false);
    assert.ok(html.includes(`href="${url}"`));
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /<a\b[^>]*>visit<\/a>/);
  }
  for (const url of [
    "./README.md",
    "//example.test/path",
    "javascript:void",
    "data:text/plain,no",
  ]) {
    const html = markdownHtml(`[read more](${url})`, false);
    assert.match(html, /read more/);
    assert.doesNotMatch(html, /\bhref=/i);
  }
});

test("author HTML cannot create elements, even allowed Markdown links; media is dropped", () => {
  const html = markdownHtml(
    'See src/main.ts <a href="https://example.test">label</a> ![photo](https://example.test/p.png) <video src="/movie"></video>',
    false,
  );
  assert.match(html, /See src\/main\.ts/);
  assert.doesNotMatch(html, /<(?:a|img|video)\b|\bsrc=/i);
});

test("fences over either highlighting limit keep their complete escaped source as plain text", () => {
  for (const source of ["x".repeat(2001), "const x = 1;\n".repeat(1600)]) {
    const html = markdownHtml("```js\n" + source + "<end>&\n```", false);
    const text = html.replace(/<[^>]+>/g, "");
    assert.ok(text.includes(source + "&lt;end&gt;&amp;"));
    assert.doesNotMatch(html, /<span style=/);
  }
});

test("a delta ending on a strong opener waits for the label, not settlement", () => {
  for (const opening of ["**", "Read **"]) {
    assert.doesNotMatch(markdownHtml(opening, true), /\*\*/);
    assert.match(
      markdownHtml(opening + "this", true),
      /<strong\b[^>]*>this<\/strong>/,
    );
    assert.match(markdownHtml(opening, false), /\*\*/);
  }
});

test("streamed HTML matches a persistent formatter through append and settlement", (t) => {
  const renderer = createHtmlRenderer(markdownOptions);
  t.after(() => renderer.dispose());
  function render(text: string, streaming: boolean) {
    const html = markdownHtml(text, streaming);
    assert.equal(renderer.render(text, streaming, streaming).html, html);
    return html;
  }

  const openFence = '```js\nconst value = "<tag>&";';
  const partial = render(openFence, true);
  assert.match(partial, /data-incomplete="true"/);
  assert.match(partial, /&lt;tag&gt;&amp;/);
  assert.doesNotMatch(partial, /<span style=/);

  const appended = openFence + "\n```\n\nStill **typing";
  const streaming = render(appended, true);
  assert.match(streaming, /<span style="color:/);
  assert.match(streaming, /&lt;tag&gt;&amp;/);
  assert.doesNotMatch(streaming, /<tag>|data-incomplete=/);
  assert.match(streaming, /<strong\b[^>]*>typing<\/strong>/);
  assert.match(render(appended, false), /Still \*\*typing/);
});
