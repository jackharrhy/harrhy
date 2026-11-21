import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";

test("external registry reload publishes roster, routes and directory together without restart", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-registry-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = path.join(root, "atlas.json");
  const spaces = ["alpha", "beta"].map((id) => ({
    id,
    name: id.toUpperCase(),
    directory: id,
  }));
  for (const id of ["alpha", "beta", "unregistered"]) {
    await mkdir(path.join(root, id));
    await writeFile(
      path.join(root, id, "note.md"),
      `---\ntitle: ${id} article\npath: /note/\n---\n${id} uniquecontent`,
    );
  }
  const save = async (value: unknown) => {
    await writeFile(manifest + ".tmp", JSON.stringify(value));
    await rename(manifest + ".tmp", manifest);
  };
  await save({ spaces });
  const { router, catalog } = await createAtlas(root, manifest);
  const get = (url: string) => router.fetch(`http://localhost${url}`);
  assert.equal((await get("/spaces/gamma/note/")).status, 404);
  const stop = catalog.watch();
  t.after(stop);
  await mkdir(path.join(root, "gamma"));
  await writeFile(
    path.join(root, "gamma", "note.md"),
    "---\ntitle: gamma article\npath: /note/\n---\ngamma uniquecontent",
  );
  spaces.push({ id: "gamma", name: "GAMMA", directory: "gamma" });
  await save({ spaces });
  const deadline = Date.now() + 8000;
  while (!catalog.read().generation!.spaces.some((space) => space.id === "gamma")) {
    assert.ok(Date.now() < deadline, "periodic reload publishes new registration");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.match(await (await get("/spaces/alpha/")).text(), /GAMMA/);
  assert.equal((await get("/spaces/gamma/note/")).status, 200);
  assert.match(await (await get("/spaces/gamma/")).text(), /gamma article/);
  assert.doesNotMatch(await (await get("/spaces/alpha/")).text(), /gamma article/);
  assert.equal((await get("/spaces/unregistered/note/")).status, 404);
  const good = catalog.read().generation;
  for (const value of [
    { spaces, unknown: true },
    { spaces: [{ ...spaces[0], directory: "../private" }] },
    { spaces: [{ ...spaces[0], extra: true }] },
    { spaces: [spaces[0], spaces[0]] },
    { spaces: [{ ...spaces[0], optional: "yes" }] },
    { spaces: [{ ...spaces[0], name: "bad\nname" }] },
    { spaces: spaces.map((space) => ({ ...space, legacyRoutes: true })) },
    {
      spaces: Array.from({ length: 65 }, (_, index) => ({
        id: `agent-${index}`,
        name: "Agent",
        directory: `agent-${index}`,
      })),
    },
  ]) {
    await save(value);
    await catalog.refresh();
    assert.equal(catalog.read().generation, good);
    assert.equal((await get("/healthz")).status, 503);
    assert.equal((await get("/spaces/gamma/note/")).status, 200);
  }
  await save({ spaces: [{ ...spaces[0], name: "Renamed Alpha" }] });
  await catalog.refresh();
  assert.match(await (await get("/spaces/alpha/")).text(), /Renamed Alpha/);
  assert.equal((await get("/spaces/gamma/note/")).status, 404);
  assert.equal((await get("/healthz")).status, 200);
  await save({ spaces: [] });
  await catalog.refresh();
  const emptyHome = await get("/");
  assert.equal(emptyHome.status, 200);
  assert.match(await emptyHome.text(), /No agents available/);
  await save({ spaces: [spaces[1], spaces[0]] });
  await catalog.refresh();
  assert.equal((await get("/")).headers.get("location"), "/spaces/beta/");
  assert.equal((await get("/?space=alpha")).headers.get("location"), "/spaces/alpha/");
  await save({ spaces: "invalid" });
  await catalog.refresh();
  assert.equal(
    (await get("/")).headers.get("location"),
    "/spaces/beta/",
    "root retains the last validated registry order",
  );
  assert.equal((await get("/healthz")).status, 503);
  await rename(manifest, manifest + ".saved");
  await symlink(manifest + ".saved", manifest);
  await catalog.refresh();
  assert.equal(catalog.read().status, "stale");
  await assert.rejects(createAtlas(root, manifest), /valid curated catalog/);
  await rm(manifest);
  await writeFile(manifest, "{");
  await assert.rejects(createAtlas(root, manifest), /valid curated catalog/);
  await rm(manifest);
  await assert.rejects(createAtlas(root, manifest), /valid curated catalog/);
});
