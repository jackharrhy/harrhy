import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderMarkdown } from "../markdown.ts";

test("watch-mode dependency messages cannot consume the diagram worker result", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-diagram-watch-"));
  const fixture = path.join(root, "render.mjs");
  const markdown = new URL("../markdown.ts", import.meta.url).href;
  await writeFile(
    fixture,
    `import {renderMarkdown} from ${JSON.stringify(markdown)}; const result = await renderMarkdown("\u0060\u0060\u0060mermaid\\nflowchart LR\\n A --> B\\n\u0060\u0060\u0060"); console.log("WATCH_DIAGRAM=" + result.html.includes("data-atlas-diagram")); setInterval(() => {}, 1000);`,
  );
  const child = spawn(process.execPath, ["--watch", "--import", "remix/node-tsx", fixture], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const output = await new Promise<string>((resolve, reject) => {
      let text = "";
      const timer = setTimeout(() => reject(new Error("Watch-mode diagram timed out")), 8000);
      child.stdout.on("data", (chunk) => {
        text += chunk;
        if (/WATCH_DIAGRAM=(?:true|false)/.test(text)) {
          clearTimeout(timer);
          resolve(text);
        }
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Watcher exited before result"));
      });
    });
    assert.match(output, /WATCH_DIAGRAM=true/);
  } finally {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit Mermaid fences render bounded static SVG with readable source, outside quote projection", async () => {
  const result = await renderMarkdown(
    "Before\n\n```mermaid\nflowchart LR\n A[Draft] --> B[Validate]\n B --> C[Publish]\n```\n\nAfter",
  );
  assert.match(result.html, /data-atlas-diagram/);
  assert.match(result.html, /<svg[^>]+viewBox=/);
  assert.match(result.html, /<text[^>]*>Validate<\/text>/);
  assert.match(result.html, /Diagram source/);
  assert.equal(result.annotationText, "Before\n\nAfter");
  assert.doesNotMatch(result.html, /<(?:script|foreignObject|image)\b/);
  assert.deepEqual(result.links, []);
});

test("diagram links, images, callbacks and authored SVG never acquire browser capabilities", async () => {
  const result = await renderMarkdown(
    '```mermaid\nflowchart LR\n A[Draft] --> B[Publish]\n click A "https://example.test/leak"\n click B call alert()\n```\n\n<svg onload="alert(1)"><text>Injected</text></svg>',
  );
  assert.match(result.html, /<svg/);
  assert.doesNotMatch(result.html, /<a\b|<image\b|onload=|onclick=|<script\b|Injected/);
  assert.equal(result.html.match(/<svg/g)?.length, 1);
  const geometry = result.html.slice(result.html.indexOf("<svg"), result.html.indexOf("</svg>"));
  assert.doesNotMatch(geometry, /url\(|https:|style=|class=|href=|<a|<image/);
  assert.deepEqual(result.links, []);
});

test("invalid, oversized and excess diagrams retain ordinary complete code fallback", async () => {
  const invalid = await renderMarkdown("```mermaid\nnot a diagram\n```");
  assert.doesNotMatch(invalid.html, /<svg/);
  assert.match(invalid.html.replace(/<[^>]*>/g, ""), /not a diagram/);
  const large = await renderMarkdown("```mermaid\n" + "x".repeat(10001) + "\n```");
  assert.doesNotMatch(large.html, /<svg/);
  assert.match(large.html, /x{10001}/);
  const many = await renderMarkdown(
    Array.from({ length: 9 }, () => "```mermaid\nflowchart LR\n A --> B\n```").join("\n\n"),
  );
  assert.equal(many.html.match(/<svg/g)?.length, 8);
  assert.equal(many.html.match(/data-atlas-diagram/g)?.length, 9);
  assert.equal(invalid.annotationText, "");
  assert.equal(large.annotationText, "");
  assert.equal(many.annotationText.trim(), "");
});
