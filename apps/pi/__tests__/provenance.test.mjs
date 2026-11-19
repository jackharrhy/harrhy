import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const app = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(app, "provenance.json"), "utf8"));
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist"].includes(entry.name)) return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  });
}
test("retained source trees match the reviewed provenance", () => {
  assert.equal(manifest.commit, "50fe622ab4379b41e6755365dd5cc53c1f04d851");
  for (const [directory, expected] of Object.entries(manifest.trees)) {
    const root = join(app, directory);
    const hash = createHash("sha256");
    for (const path of files(root).toSorted()) {
      hash.update(relative(root, path));
      hash.update(Buffer.from([0]));
      hash.update(createHash("sha256").update(readFileSync(path)).digest());
    }
    assert.equal(hash.digest("hex"), expected, directory);
  }
  assert.equal(
    createHash("sha256")
      .update(readFileSync(join(app, "LICENSE")))
      .digest("hex"),
    manifest.licenseSha256,
  );
});
