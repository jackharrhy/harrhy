import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  symlink,
  link,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { imageHref, serveImage } from "../app/images.ts";
import { renderMarkdown } from "../app/content/markdown.ts";
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFioAAAAASUVORK5CYII=",
  "base64",
);

test("Markdown raster URLs resolve inside their own space; remote and unsafe images remain stripped", async () => {
  assert.equal(
    imageHref("alpha", "/", "images/pixel.png"),
    "/_atlas/images/alpha/pixel.png",
  );
  assert.equal(
    imageHref("alpha", "/guide/page/", "../../images/pixel.png"),
    "/_atlas/images/alpha/pixel.png",
  );
  for (const source of [
    "https://tracker.example/a.png",
    "//tracker.example/a.png",
    "data:image/png;base64,AAAA",
    "/images/a.svg",
    "/private.png",
    "/spaces/beta/images/a.png",
    "/images/%2e%2e/a.png",
    "/images/a.png?secret=1",
    "/images/a.png#hash",
    "/images/..\\outside.png",
    "/other/../images/a.png",
    "/images/sub/../a.png",
    " http://atlas.local/images/a.png",
    "/images/a.png\n",
  ])
    assert.equal(imageHref("alpha", "/", source), undefined, source);
  const rendered = await renderMarkdown(
    'Before.\n\n![Useful alt](/images/pixel.png "A title")\n\n![relative](../../images/pixel.png)\n\n![remote](https://tracker.example/a.png)\n\n<img src="/images/pixel.png" alt="Raw safe" srcset="https://tracker.example/b.png 2x" onerror="evil()" style="width:100vw">\n\nAfter.',
    undefined,
    (src) => imageHref("alpha", "/guide/page/", src),
  );
  assert.equal((rendered.html.match(/<img /g) ?? []).length, 3);
  assert.match(
    rendered.html,
    /src="\/_atlas\/images\/alpha\/pixel.png" alt="Useful alt" title="A title" loading="lazy" decoding="async"/,
  );
  assert.doesNotMatch(rendered.html, /tracker|onerror|srcset|style=|evil/);
  assert.match(rendered.annotationText, /^Before\.[\s]*After\.$/);
  assert.doesNotMatch(
    rendered.annotationText,
    /Useful alt|relative|remote|Raw safe/,
  );
  assert.deepEqual(rendered.links, []);
});

test("registered raster assets enforce type, file containment, bounded reads and private revalidation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-images-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "alpha", "images"), { recursive: true });
  await mkdir(path.join(root, "beta", "images"), { recursive: true });
  await writeFile(path.join(root, "alpha", "images", "pixel.png"), pixel);
  await writeFile(path.join(root, "beta", "images", "pixel.png"), pixel);
  const spaces = [{ id: "alpha", directory: "alpha" }];
  const get = (asset: string, headers?: HeadersInit) =>
    serveImage(
      new Request(`http://atlas.example/_atlas/images/${asset}`, { headers }),
      root,
      spaces,
    );
  const response = await get("alpha/pixel.png");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "private, no-cache");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pixel);
  const etag = response.headers.get("etag")!;
  assert.equal(
    (await get("alpha/pixel.png", { "If-None-Match": etag })).status,
    304,
  );
  await writeFile(
    path.join(root, "alpha", "images", "pixel.png.tmp"),
    Buffer.concat([pixel, Buffer.from([0])]),
  );
  await rename(
    path.join(root, "alpha", "images", "pixel.png.tmp"),
    path.join(root, "alpha", "images", "pixel.png"),
  );
  const changed = await get("alpha/pixel.png", { "If-None-Match": etag });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("etag"), etag);
  await writeFile(path.join(root, "alpha", "images", "wrong.jpg"), pixel);
  await writeFile(
    path.join(root, "alpha", "images", "active.svg"),
    '<svg onload="evil()"/>',
  );
  await writeFile(
    path.join(root, "alpha", "images", "too-big.png"),
    Buffer.alloc(8 * 1024 * 1024 + 1),
  );
  await writeFile(path.join(root, "outside.png"), pixel);
  await symlink(
    path.join(root, "outside.png"),
    path.join(root, "alpha", "images", "linked.png"),
  );
  await link(
    path.join(root, "outside.png"),
    path.join(root, "alpha", "images", "hard.png"),
  );
  for (const asset of [
    "beta/pixel.png",
    "unknown/pixel.png",
    "alpha/wrong.jpg",
    "alpha/active.svg",
    "alpha/too-big.png",
    "alpha/linked.png",
    "alpha/hard.png",
    "alpha/pixel.png?x=1",
    "alpha/%2foutside.png",
    "alpha/%252e%252e/outside.png",
    "alpha/../../outside.png",
    "alpha/note.md",
  ]) {
    assert.equal((await get(asset)).status, 404, asset);
  }
  await rename(
    path.join(root, "alpha", "images"),
    path.join(root, "alpha", "original-images"),
  );
  await symlink(
    path.join(root, "beta", "images"),
    path.join(root, "alpha", "images"),
  );
  assert.equal(
    (await get("alpha/pixel.png")).status,
    404,
    "ancestor symlink rejected",
  );
});
