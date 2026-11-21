import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, rename, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";

const source = (label: string) => `import { Button } from '@harrhy/ui/native';
import {on} from 'remix/component';
globalThis.atlasWidgetRan = true;
export function Widget(handle) { let n=0;return ()=><Button mix={on('click',()=>{n++;handle.update()})}>${label} {n}</Button> }`;

test("registered external widgets compile only for browsers and publish coherent last-good generations", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-widgets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "alpha"));
  await mkdir(path.join(root, "code"));
  const content = path.join(root, "alpha", "note.md");
  const module = path.join(root, "code", "example.tsx");
  const manifest = path.join(root, "widgets.json");
  await writeFile(
    path.join(root, "atlas.json"),
    JSON.stringify({
      spaces: [{ id: "alpha", name: "Alpha", directory: "alpha" }],
    }),
  );
  await writeFile(
    content,
    "---\ntitle: Widget article\npath: /example/\n---\nReadable fallback.\n\n<details open><summary>Nested widget</summary>\n\n[[widget:example]]\n\nNested fallback.\n\n</details>\n",
  );
  await writeFile(module, source("First"));
  const config = {
    trust: "tailnet-owner-temporary",
    root: path.join(root, "code"),
    widgets: [
      {
        id: "example",
        space: "alpha",
        page: "/example/",
        module: "example.tsx",
      },
    ],
  };
  await writeFile(manifest, JSON.stringify(config));
  const { catalog, router } = await createAtlas(root, path.join(root, "atlas.json"), manifest);
  assert.equal(
    (globalThis as Record<string, unknown>).atlasWidgetRan,
    undefined,
    "authored top-level code never executes in Node",
  );
  const get = (url: string) => router.fetch(`http://localhost${url}`);
  const response = await get("/spaces/alpha/example/");
  assert.equal(response.status, 200);
  const html = await response.text();
  const first = catalog.read().generation!.widgets[0]!;
  assert.match(html, /Readable fallback/);
  assert.match(html, /Interactive content requires JavaScript/);
  assert.match(
    html,
    /<details open><summary>Nested widget<\/summary>[\s\S]*<section data-atlas-widget aria-label="Interactive content">[\s\S]*Nested fallback\.[\s\S]*<\/details>/,
  );
  assert.match(
    (await get("/spaces/alpha/example")).headers.get("content-security-policy")!,
    /script-src 'nonce-/,
  );
  assert.ok(html.includes(`/_atlas/widgets/${first.digest}.js`));
  assert.match(response.headers.get("content-security-policy")!, /script-src 'nonce-/);
  const script = await get(`/_atlas/widgets/${first.digest}.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("cache-control")!, /^private,.*immutable/);
  assert.match(await script.text(), /First/);
  assert.match(
    (await get("/spaces/alpha/")).headers.get("content-security-policy")!,
    /script-src 'nonce-/,
  );
  for (const url of [
    "/code/example.tsx",
    "/widgets.json",
    "/_atlas/widgets/unknown.js",
    "/assets/npm/node:fs",
  ])
    assert.equal((await get(url)).status, 404);
  await writeFile(module, source("Second"));
  await catalog.refresh();
  const second = catalog.read().generation!.widgets[0]!;
  assert.notEqual(second.digest, first.digest);
  assert.match(await (await get(`/_atlas/widgets/${second.digest}.js`)).text(), /Second/);
  assert.equal(
    await (await get(`/_atlas/widgets/${first.digest}.js`)).text(),
    first.script,
    "old hash returns old bytes",
  );
  const good = catalog.read().generation;
  for (const broken of [
    "invalid syntax <",
    "import fs from 'node:fs'; export function Widget(){return ()=>null}",
    "import {x} from '../private.ts'; export function Widget(){return ()=>x}",
    "import 'https://example.com/code.js'; export function Widget(){return ()=>null}",
  ]) {
    await writeFile(module, broken);
    await catalog.refresh();
    assert.equal(catalog.read().generation, good);
    assert.equal((await get("/healthz")).status, 503);
    assert.match(
      await (await get("/spaces/alpha/example/")).text(),
      /last validated version|last validated/,
    );
  }
  await writeFile(module, source("Third"));
  await catalog.refresh();
  assert.equal(catalog.read().status, "ready");
  await rename(module, module + ".saved");
  await symlink(module + ".saved", module);
  await catalog.refresh();
  assert.equal(catalog.read().status, "stale");
  await assert.rejects(
    createAtlas(root, path.join(root, "atlas.json"), manifest),
    /valid curated catalog/,
  );
  await rm(module);
  await rename(module + ".saved", module);
  await writeFile(manifest, JSON.stringify({ ...config, trust: "implicit" }));
  await catalog.refresh();
  assert.equal(catalog.read().status, "stale");
  await writeFile(
    manifest,
    JSON.stringify({
      ...config,
      widgets: [{ ...config.widgets[0], module: "../private.tsx" }],
    }),
  );
  await catalog.refresh();
  assert.equal(catalog.read().status, "stale");
  await writeFile(manifest, JSON.stringify({ ...config, widgets: [] }));
  await writeFile(content, "---\ntitle: Plain article\npath: /example/\n---\nStill readable.");
  await catalog.refresh();
  assert.equal(catalog.read().status, "ready");
  assert.doesNotMatch(
    await (await get("/spaces/alpha/example/")).text(),
    /<script[^>]+src="\/_atlas\/widgets\//,
  );
  await writeFile(path.join(root, "code", "additional.tsx"), source("Additional"));
  await writeFile(
    path.join(root, "alpha", "additional.md"),
    "---\ntitle: Additional page\npath: /additional/\n---\nNew external content.\n\n[[widget:additional]]\n",
  );
  await writeFile(
    manifest,
    JSON.stringify({
      ...config,
      widgets: [
        {
          id: "additional",
          space: "alpha",
          page: "/additional/",
          module: "additional.tsx",
        },
      ],
    }),
  );
  await catalog.refresh();
  assert.equal(catalog.read().status, "ready");
  assert.match(await (await get("/spaces/alpha/additional/")).text(), /atlas-widget-additional/);
  assert.match(catalog.read().generation!.widgets[0]!.script, /Additional/);
  assert.equal(
    (await get(`/_atlas/widgets/${first.digest}.js`)).status,
    404,
    "evicted generations do not return replacement bytes",
  );
});
