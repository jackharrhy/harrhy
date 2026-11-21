import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";

test("private SSR routes, aliases, authors, navigation and coherent updates", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "alpha"));
  const file = path.join(root, "alpha", "topic.md");
  await writeFile(
    file,
    "---\ntitle: Topic\npath: /pi/\naliases: [/old/]\nkind: topic\n---\nA synthetic searchable document.\n",
  );
  await writeFile(
    path.join(root, "atlas.json"),
    JSON.stringify({
      spaces: [
        { id: "alpha", name: "Alpha", directory: "alpha", legacyRoutes: true },
        { id: "beta", name: "Beta", directory: "beta", optional: true },
        { id: "gamma", name: "Gamma", directory: "gamma", optional: true },
        { id: "delta", name: "Delta", directory: "delta", optional: true },
      ],
    }),
  );
  const { router, catalog } = await createAtlas(
    root,
    path.join(root, "atlas.json"),
  );
  for (const route of [
    "/spaces/alpha/pi/",
    "/spaces/beta/",
    "/spaces/alpha/",
  ]) {
    const response = await router.fetch(`http://localhost${route}`);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(
      response.headers.get("content-security-policy")!,
      /script-src 'nonce-/,
    );
    const html = await response.text();
    assert.match(html, /<h1/);
    assert.match(html, /src="\/_atlas\/navigation.js"/);
    assert.doesNotMatch(html, /\/assets\//);
  }
  for (const home of [
    "/",
    "/spaces/",
    "/?space=unknown",
    "/?space=https://evil.invalid/",
  ]) {
    const response = await router.fetch(`http://localhost${home}`);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/spaces/alpha/");
  }
  for (const [route, title] of [
    ["/spaces/alpha/", "Alpha"],
    ["/spaces/alpha/pi/", "Topic"],
    ["/missing/", "Not found"],
  ]) {
    const html = await (await router.fetch(`http://localhost${route}`)).text();
    assert.ok(html.includes(`<title>${title} - Atlas</title>`));
    assert.match(html, /rel="icon"[^>]*href="\/favicon.svg"/);
  }
  const favicon = await router.fetch("http://localhost/favicon.svg");
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers.get("content-type")!, /^image\/svg\+xml/);
  assert.match(await favicon.text(), /🌎/);
  assert.equal((await router.fetch("http://localhost/briefs/")).status, 308);
  await writeFile(
    path.join(root, "alpha", "briefs.md"),
    "---\ntitle: Curated briefs\npath: /briefs/\n---\nExplicit page wins.",
  );
  await catalog.refresh();
  const curated = await router.fetch("http://localhost/spaces/alpha/briefs/");
  assert.equal(curated.status, 200);
  assert.match(await curated.text(), /Explicit page wins/);
  const alias = await router.fetch("http://localhost/old/");
  assert.equal(alias.status, 308);
  assert.match(alias.headers.get("location")!, /^\/spaces\/alpha\/pi\/?$/);
  assert.equal((await router.fetch("http://localhost/missing/")).status, 404);
  assert.equal(
    (await router.fetch("http://localhost/assets/app/content/catalog.ts"))
      .status,
    404,
  );
  await writeFile(
    file,
    "---\ntitle: Changed\npath: /pi/\n---\nNew generation.",
  );
  await catalog.refresh();
  assert.match(
    await (await router.fetch("http://localhost/spaces/alpha/pi/")).text(),
    /Changed/,
  );
  await writeFile(file, "---\ntitle: Broken\npath: ../../private\n---\nNo.");
  await catalog.refresh();
  const stale = await (
    await router.fetch("http://localhost/spaces/alpha/pi/")
  ).text();
  assert.match(stale, /Changed/);
  assert.match(stale, /last validated version/);
  assert.equal((await router.fetch("http://localhost/healthz")).status, 503);
});
