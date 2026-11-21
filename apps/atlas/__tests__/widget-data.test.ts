import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createWidgetLoader } from "../app/widgets.ts";

test("optional public JSON data is bounded, bundled as data, and included in widget identity", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-widget-data-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = path.join(root, "widgets.json");
  await writeFile(
    path.join(root, "card.tsx"),
    "export function Widget(handle){return ()=> <p>{handle.props.data.text}</p>}",
  );
  const base = { id: "card", space: "alpha", page: "/example/", module: "card.tsx" };
  const save = (entry: object) =>
    writeFile(
      manifest,
      JSON.stringify({ trust: "tailnet-owner-temporary", root, widgets: [entry] }),
    );
  const load = createWidgetLoader(manifest);
  await save({ ...base, data: { text: "Public snapshot one", nested: [true, null, 42] } });
  const first = (await load())[0]!;
  assert.match(first.script, /Public snapshot one/);
  await save({ ...base, data: { text: "Public snapshot two" } });
  const second = (await load())[0]!;
  assert.notEqual(second.digest, first.digest);
  assert.match(second.script, /Public snapshot two/);
  assert.doesNotMatch(first.script, /Public snapshot two/);
  let deep: unknown = null;
  for (let i = 0; i < 10; i++) deep = { next: deep };
  for (const data of [
    null,
    [],
    "not an object",
    { text: "x".repeat(16385) },
    deep,
    { list: Array(257).fill(0) },
    { ["x".repeat(129)]: 1 },
    JSON.parse('{"nested":{"__proto__":{"polluted":true}}}'),
    { constructor: {} },
    { prototype: 1 },
  ]) {
    await save({ ...base, data });
    await assert.rejects(load(), /Invalid trusted widgets/);
  }
  await save(base);
  assert.equal((await load()).length, 1, "existing registrations remain valid without data");
});
