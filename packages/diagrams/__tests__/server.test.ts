import assert from "node:assert/strict";
import test from "node:test";
import { renderDiagram, renderDiagramSvg } from "@harrhy/diagrams/server";

test("both APIs share a single slot and never expose a caller's edits to the cached tree", async () => {
  const source =
    'flowchart LR\n A[Draft] --> B[Publish]\n click A "https://example.test/"';
  const first = renderDiagram(source);
  assert.equal(await renderDiagramSvg("flowchart TD\n C --> D"), null);
  const node = await first;
  assert.ok(node);
  node.properties.title = "cache mutation";
  const html = await renderDiagramSvg(source);
  assert.ok(html);
  assert.match(html, /<svg[^>]+role="img"/);
  assert.doesNotMatch(
    html,
    /cache mutation|onclick|example\.test|url\(|style=|href=|<script\b/,
  );
});

test("rejects oversized source and exhausted budgets without suppressing later renders", async () => {
  const source = "flowchart TD\n A --> B";
  assert.equal(await renderDiagramSvg(source + " ".repeat(10000)), null);
  for (const budget of [0, NaN, 1])
    assert.equal(await renderDiagram(source, budget), null);
  assert.ok(await renderDiagram(source));
});
