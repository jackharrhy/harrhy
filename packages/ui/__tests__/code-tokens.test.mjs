import assert from "node:assert/strict";
import test from "node:test";
import "remix/node-tsx";
import { createElement as h } from "remix/component";
import { renderToString } from "remix/component/server";
const { CodeDiff } = await import("../code.tsx");

test("diff row tokens share exact-source validation, escaped text and restricted styles", async () => {
  const html = await renderToString(
    h(CodeDiff, {
      label: "Prepared changes",
      lines: [
        {
          kind: "add",
          text: "<unsafe>",
          newLine: 1,
          tokens: [
            { text: "<unsafe>", color: "#123456", italic: true, bold: true },
          ],
        },
        {
          kind: "remove",
          text: "original",
          oldLine: 1,
          tokens: [{ text: "STALE", color: "#123456" }],
        },
        {
          kind: "context",
          text: "safe",
          tokens: [
            {
              text: "safe",
              color: "red;background:url(https://invalid.test)",
              italic: "url(invalid.test)",
            },
          ],
        },
      ],
    }),
  );
  assert.match(html, /&lt;unsafe&gt;/);
  assert.match(html, /font-style: ?italic/);
  assert.match(html, /font-weight: ?bold/);
  assert.match(html, /color: ?#123456/);
  assert.match(html, /original/);
  assert.doesNotMatch(html, /STALE|invalid\.test|<unsafe>/);
});
