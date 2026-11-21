import assert from "node:assert/strict";
import test from "node:test";
import { startDoodleGallery } from "./fixtures/doodle-gallery.mjs";

test("doodle gallery rejects cross-origin writes, invalid settings and an empty pool", async (t) => {
  const { origin, close } = await startDoodleGallery();
  t.after(close);
  const url = origin + "/api/pool";
  const patch = (requestOrigin, body) =>
    fetch(url, {
      method: "PATCH",
      headers: { origin: requestOrigin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const pool = async () => (await fetch(url)).json();
  const initial = await pool();
  const valid = { enabled: ["silk-braid"], expectedRevision: initial.revision };
  const forged = await patch("http://wrong.invalid", valid);
  assert.equal(forged.status, 403);
  await forged.json();
  const invalidSettings = await patch(origin, {
    ...valid,
    settings: { silk: { color: 99 } },
  });
  assert.equal(invalidSettings.status, 400);
  await invalidSettings.json();
  const empty = await patch(origin, { ...valid, enabled: [] });
  assert.equal(empty.status, 400);
  await empty.json();
  assert.deepEqual(await pool(), initial);
});
