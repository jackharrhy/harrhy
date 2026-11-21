import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";

test("agent corpora own duplicate local paths, navigation and topic context", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-spaces-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const id of ["alpha", "beta"]) {
    await mkdir(path.join(root, id));
    await writeFile(
      path.join(root, id, "topic.md"),
      `---\ntitle: ${id} topic\npath: /pi/\naliases: [/old/]\n---\nShared keyword. [Child](/pi/tools/)\n`,
    );
    await writeFile(
      path.join(root, id, "child.md"),
      `---\ntitle: ${id} tools\npath: /pi/tools/\nparent: /old/\n---\n${id === "beta" ? "Beta material secret [Alpha](/spaces/alpha/pi/)" : "Alpha writing"}`,
    );
  }
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
  const { router, catalog } = await createAtlas(root, path.join(root, "atlas.json"));
  const html = async (address: string) => (await router.fetch(`http://localhost${address}`)).text();
  const rootResponse = await router.fetch("http://localhost/");
  assert.equal(rootResponse.status, 307);
  assert.equal(rootResponse.headers.get("location"), "/spaces/alpha/");
  const alpha = await html("/spaces/alpha/");
  assert.match(alpha, /alpha topic/);
  assert.doesNotMatch(alpha, /beta topic/);
  const topic = await html("/spaces/alpha/pi/");
  assert.match(topic, /href="\/spaces\/alpha\/pi\/tools\/"/);
  assert.match(topic, /aria-label="Alpha documents"/);
  assert.doesNotMatch(topic, /Search Alpha|href="[^"]*search/);
  assert.doesNotMatch(
    topic.match(/<section><h2>Pages<\/h2>(.*?)<\/section>/)?.[1] || "",
    /beta tools/,
  );
  assert.match(topic, /<h2>Linked from<\/h2>/);
  assert.match(topic, /href="\/spaces\/beta\/pi\/tools\/"/);
  for (const removed of ["/search/", "/spaces/alpha/search/", "/spaces/beta/search/?q=Beta"]) {
    assert.equal((await router.fetch(`http://localhost${removed}`)).status, 404);
  }
  assert.match(await html("/spaces/beta/pi/tools/"), /href="\/spaces\/alpha\/pi\/"/);
  for (const legacy of ["/pi/", "/old/", "/pi/tools/"]) {
    const response = await router.fetch(`http://localhost${legacy}?q=keep`);
    assert.equal(response.status, 308);
    assert.equal(
      response.headers.get("location"),
      `/spaces/alpha/${legacy === "/old/" ? "pi/" : legacy.slice(1)}?q=keep`,
    );
  }
  assert.equal(Object.keys(catalog.read().generation!.pages).length, 4);
  assert.equal((await router.fetch("http://localhost/spaces/unknown/")).status, 404);
  assert.equal((await router.fetch("http://localhost/spaces/delta/")).status, 200);
  for (const id of ["alpha", "beta"]) {
    for (const [alias, destination] of [
      ["briefs", "days/"],
      ["dossiers", ""],
    ]) {
      const response = await router.fetch(`http://localhost/spaces/${id}/${alias}/`);
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), `/spaces/${id}/${destination}`);
    }
  }
  const previous = catalog.read().generation;
  await writeFile(
    path.join(root, "alpha", "bad-parent.md"),
    "---\ntitle: Bad parent\npath: /bad/\nparent: /spaces/beta/pi/\n---\nCross-owner parent must fail.",
  );
  const rejected = await catalog.refresh();
  assert.equal(rejected.status, "stale");
  assert.equal(rejected.generation, previous);
  assert.match(rejected.error!, /Reserved catalog route/);
});
