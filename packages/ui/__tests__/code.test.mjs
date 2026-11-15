import assert from "node:assert/strict";
import test from "node:test";
import "remix/node-tsx";
import { createElement as h } from "remix/component";
import { renderToString } from "remix/component/server";
const { CodeBlock, CodeDiff } = await import("../code.tsx");

test("CodeBlock is escaped, complete native SSR with named keyboard scrolling", async () => {
  const source = '<script>alert("unsafe")</script>\n\tconst emoji = "🦊";\n';
  const html = await renderToString(
    h(CodeBlock, {
      label: "Example <source>",
      source,
      language: "tsx<script>",
    }),
  );
  assert.match(html, /<figure/);
  assert.match(html, /<figcaption/);
  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Example &lt;source&gt;"/);
  assert.match(html, /tabindex="0"/i);
  assert.match(
    html,
    /<code>&lt;script&gt;alert\("unsafe"\)&lt;\/script&gt;\n\tconst emoji = "🦊";\n<\/code>/,
  );
  assert.match(html, /tsx&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|rmx:h:|language-tsx/);
  assert.match(html, /overflow:\s*auto/);
  assert.match(html, /max-height:\s*28rem/);
  assert.match(html, /--hui-font-code/);
});

test("CodeDiff keeps change semantics and caller-owned line numbers without color", async () => {
  const lines = [
    { kind: "context", text: "export {", oldLine: 10, newLine: 20 },
    { kind: "remove", text: '<old unsafe="yes">', oldLine: 11 },
    { kind: "add", text: "  Button,", newLine: 21 },
    { kind: "add", text: "", newLine: 22 },
  ];
  const snapshot = structuredClone(lines);
  const html = await renderToString(h(CodeDiff, { label: "Exports", lines }));
  assert.deepEqual(lines, snapshot);
  assert.match(html, /aria-label="Exports"/);
  assert.match(html, /data-change="context"/);
  assert.match(html, /data-change="remove"/);
  assert.match(html, /data-change="add"/);
  assert.match(html, /Context old line 10 new line 20: /);
  assert.match(html, /Removed old line 11: /);
  assert.match(html, /Added new line 21: /);
  assert.match(html, /Added new line 22: /);
  assert.match(html, /− /);
  assert.match(html, /\+ /);
  assert.match(html, /&lt;old unsafe="yes"&gt;/);
  assert.match(html, /forced-colors:\s*active/);
  assert.doesNotMatch(html, /<old|<script|rmx:h:/);
});

test("empty and large input remain honest: no invented content or silent truncation", async () => {
  const empty = await renderToString(
    h(CodeBlock, { label: "Empty file", source: "" }),
  );
  assert.match(empty, /<code><\/code>/);
  const diff = await renderToString(
    h(CodeDiff, { label: "No changes", lines: [] }),
  );
  assert.doesNotMatch(diff, /data-change=/);
  const source = `${"x".repeat(100_000)}\nTHE_END\n`;
  const large = await renderToString(
    h(CodeBlock, { label: "Long line", source }),
  );
  assert.ok(large.includes(source));
  assert.doesNotMatch(large, /truncated|omitted/);
});
