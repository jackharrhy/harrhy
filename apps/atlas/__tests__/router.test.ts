import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";

test("private SSR routes, aliases, authors, search and coherent updates", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "wonder"));
  const file = path.join(root, "wonder", "topic.md");
  await writeFile(
    file,
    "---\ntitle: Topic\npath: /pi/\naliases: [/old/]\nkind: topic\n---\nA synthetic searchable document.\n",
  );
  const { router, catalog } = await createAtlas(root);
  for (const route of [
    "/",
    "/spaces/wonder/pi/",
    "/spaces/wonder/search/?q=searchable",
    "/spaces/infra/",
    "/spaces/wonder/",
  ]) {
    const response = await router.fetch(`http://localhost${route}`);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(
      response.headers.get("content-security-policy")!,
      /script-src 'none'/,
    );
    const html = await response.text();
    assert.match(html, /<h1/);
    assert.doesNotMatch(html, /<script|\/assets\//);
  }
  assert.equal((await router.fetch("http://localhost/briefs/")).status, 308);
  await writeFile(
    path.join(root, "wonder", "briefs.md"),
    "---\ntitle: Curated briefs\npath: /briefs/\n---\nExplicit page wins.",
  );
  await catalog.refresh();
  const curated = await router.fetch("http://localhost/spaces/wonder/briefs/");
  assert.equal(curated.status, 200);
  assert.match(await curated.text(), /Explicit page wins/);
  const alias = await router.fetch("http://localhost/old/");
  assert.equal(alias.status, 308);
  assert.match(alias.headers.get("location")!, /^\/spaces\/wonder\/pi\/?$/);
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
    await (await router.fetch("http://localhost/spaces/wonder/pi/")).text(),
    /Changed/,
  );
  await writeFile(file, "---\ntitle: Broken\npath: ../../private\n---\nNo.");
  await catalog.refresh();
  const stale = await (
    await router.fetch("http://localhost/spaces/wonder/pi/")
  ).text();
  assert.match(stale, /Changed/);
  assert.match(stale, /last validated version/);
  assert.equal((await router.fetch("http://localhost/healthz")).status, 503);
});
