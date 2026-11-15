import assert from "node:assert/strict";
import test from "node:test";
import { highlightCode, highlightCodeHtml } from "../highlight.ts";
import { rehypeHighlight } from "../rehype-highlight.ts";

test("Highlights preserves exact UTF-16 source and line endings in both themes", () => {
  for (const theme of ["github-light", "github-dark"]) {
    for (const source of [
      "",
      '\tconst fox = "🦊";\r\n// comment\n\n',
      "a\rb",
      "<script>bad()</script>",
      "\ud800",
    ]) {
      const tokens = highlightCode(source, { language: "tsx", theme });
      assert.equal(tokens.map((token) => token.text).join(""), source);
      assert.ok(
        tokens.every(
          (token) => !token.color || /^#[0-9a-f]{6}$/i.test(token.color),
        ),
      );
    }
  }
  assert.ok(
    highlightCode("const x = 1", { language: "tsx" }).some(
      (token) => token.color,
    ),
  );
});

test("unknown languages and bounded work retain complete text; HTML never interprets source", () => {
  for (const source of [
    "x".repeat(2001),
    "x\n".repeat(11000),
    '<img src=x onerror="bad()">&\r\n',
  ]) {
    assert.equal(
      highlightCode(source, { language: "not-a-language" })
        .map((token) => token.text)
        .join(""),
      source,
    );
  }
  const html = highlightCodeHtml('<script>"&</script>', { language: "html" });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;/);
  assert.match(html, /hui-highlight github-light/);
});

test("rehype changes only plain fenced code, preserves exact projection and inline code", () => {
  const source = '\tconst fox = "🦊";\r\n\n';
  const inline = {
    type: "element",
    tagName: "code",
    properties: {},
    children: [{ type: "text", value: "inline" }],
  };
  const code = {
    type: "element",
    tagName: "code",
    properties: { className: ["language-tsx"] },
    children: [{ type: "text", value: source }],
  };
  const pre = {
    type: "element",
    tagName: "pre",
    properties: {},
    children: [code],
  };
  const tree = { type: "root", children: [inline, pre] };
  rehypeHighlight()(tree);
  const text = (node) =>
    node.type === "text" ? node.value : node.children.map(text).join("");
  assert.equal(text(code), source);
  assert.deepEqual(pre.properties.className, ["hui-highlight", "github-light"]);
  assert.equal(inline.children.length, 1);
  assert.equal(inline.children[0].type, "text");
  assert.ok(code.children.some((node) => node.type === "element"));
});
