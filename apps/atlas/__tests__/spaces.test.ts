import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";

test("agent corpora own duplicate local paths, search, navigation and topic context", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-spaces-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const id of ["wonder", "infra"]) {
    await mkdir(path.join(root, id));
    await writeFile(
      path.join(root, id, "topic.md"),
      `---\ntitle: ${id} topic\npath: /pi/\naliases: [/old/]\n---\nShared keyword. [Child](/pi/tools/)\n`,
    );
    await writeFile(
      path.join(root, id, "child.md"),
      `---\ntitle: ${id} tools\npath: /pi/tools/\nparent: /old/\n---\n${id === "infra" ? "Infrastructure secret [Wonder](/spaces/wonder/pi/)" : "Wonder writing"}`,
    );
  }
  const { router, catalog } = await createAtlas(root);
  const html = async (address: string) =>
    (await router.fetch(`http://localhost${address}`)).text();
  const directory = await html("/");
  assert.match(directory, /Agent spaces/);
  assert.match(directory, /\/spaces\/pi-handyman\//);
  assert.doesNotMatch(directory, /wonder topic|infra topic/);
  const wonder = await html("/spaces/wonder/");
  assert.match(wonder, /wonder topic/);
  assert.doesNotMatch(wonder, /infra topic/);
  const topic = await html("/spaces/wonder/pi/");
  assert.match(topic, /href="\/spaces\/wonder\/pi\/tools\/"/);
  assert.match(topic, /Search Wonder/);
  assert.doesNotMatch(
    topic.match(/<section><h2>Pages<\/h2>(.*?)<\/section>/)?.[1] || "",
    /infra tools/,
  );
  assert.match(topic, /<h2>Linked from<\/h2>/);
  assert.match(topic, /href="\/spaces\/infra\/pi\/tools\/"/);
  const results = await html("/spaces/wonder/search/?q=Shared");
  assert.match(results, /wonder topic/);
  assert.doesNotMatch(results, /infra topic/);
  assert.doesNotMatch(
    await html("/spaces/wonder/search/?q=Infrastructure"),
    /infra tools/,
  );
  assert.match(
    await html("/spaces/infra/search/?q=Infrastructure"),
    /infra tools/,
  );
  assert.match(
    await html("/spaces/infra/pi/tools/"),
    /href="\/spaces\/wonder\/pi\/"/,
  );
  for (const legacy of ["/pi/", "/old/", "/pi/tools/"]) {
    const response = await router.fetch(`http://localhost${legacy}?q=keep`);
    assert.equal(response.status, 308);
    assert.equal(
      response.headers.get("location"),
      `/spaces/wonder/${legacy === "/old/" ? "pi/" : legacy.slice(1)}?q=keep`,
    );
  }
  assert.equal(Object.keys(catalog.read().generation!.pages).length, 4);
  assert.equal(
    (await router.fetch("http://localhost/spaces/unknown/")).status,
    404,
  );
  assert.equal(
    (await router.fetch("http://localhost/spaces/mailman/")).status,
    200,
  );
  for (const id of ["wonder", "infra"]) {
    for (const [alias, destination] of [
      ["briefs", "days/"],
      ["dossiers", ""],
    ]) {
      const response = await router.fetch(
        `http://localhost/spaces/${id}/${alias}/`,
      );
      assert.equal(response.status, 308);
      assert.equal(
        response.headers.get("location"),
        `/spaces/${id}/${destination}`,
      );
    }
  }
  const previous = catalog.read().generation;
  await writeFile(
    path.join(root, "wonder", "bad-parent.md"),
    "---\ntitle: Bad parent\npath: /bad/\nparent: /spaces/infra/pi/\n---\nCross-owner parent must fail.",
  );
  const rejected = await catalog.refresh();
  assert.equal(rejected.status, "stale");
  assert.equal(rejected.generation, previous);
  assert.match(rejected.error!, /Reserved catalog route/);
});
