import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

test("actual workerd executes the optional adapter using precompiled WASM without browser/Remix imports", async () => {
  const result = await build({
    stdin: {
      contents: `import {highlightCode, highlightCodeHtml} from './highlight.ts';
        import {rehypeHighlight} from './rehype-highlight.ts';
        export default {fetch() {
          const source = '\\tconst fox = "🦊";\\r\\n<script>unsafe()</script>\\n';
          const tree = {type:'root',children:[{type:'element',tagName:'pre',properties:{},children:[{type:'element',tagName:'code',properties:{className:['language-tsx']},children:[{type:'text',value:source}]}]}]};
          rehypeHighlight()(tree);
          return Response.json({source,tokens:highlightCode(source,{language:'tsx'}),html:highlightCodeHtml(source,{language:'tsx'}),tree});
        }};`,
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
      sourcefile: "highlight-worker.mjs",
    },
    bundle: true,
    platform: "browser",
    conditions: ["workerd"],
    format: "esm",
    write: false,
    metafile: true,
    plugins: [
      {
        name: "precompiled-wasm",
        setup(builder) {
          builder.onResolve({ filter: /\.wasm$/ }, () => ({
            path: "./highlights.wasm",
            external: true,
          }));
        },
      },
    ],
  });
  assert.ok(
    Object.keys(result.metafile.inputs).some((path) =>
      path.endsWith("highlights/dist/workerd.js"),
    ),
  );
  assert.ok(
    !Object.keys(result.metafile.inputs).some((path) =>
      /remix|code\.tsx|highlights\.wasm\.mjs/.test(path),
    ),
  );
  const wasm = await readFile(
    new URL("highlights.wasm", import.meta.resolve("@pierre/highlights")),
  );
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: "hui-highlight-test",
          compatibilityDate: "2026-11-15",
          manifest: {
            mainModule: "worker.mjs",
            modulesRoot: import.meta.dirname,
            modules: {
              "worker.mjs": {
                type: "esm",
                contents: result.outputFiles[0].text,
              },
              "highlights.wasm": {
                type: "wasm",
                contents: new Uint8Array(wasm),
              },
            },
          },
        },
      },
    ],
  });
  try {
    const response = await runtime.dispatchFetch("http://localhost/");
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(
      value.tokens.map((token) => token.text).join(""),
      value.source,
    );
    assert.ok(value.tokens.some((token) => token.color));
    assert.doesNotMatch(value.html, /<script>/);
    const text = (node) =>
      node.type === "text" ? node.value : node.children.map(text).join("");
    assert.equal(text(value.tree), value.source);
  } finally {
    await runtime.dispose();
  }
});
