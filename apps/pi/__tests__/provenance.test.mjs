import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const app = new URL("../", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("provenance.json", app), "utf8"),
);
test("pinned source and public model catalog match the reviewed import", () => {
  assert.equal(manifest.commit, "2a74fd2a6c78cce7f72d27655f4d132ecf2bf236");
  for (const [path, expected] of Object.entries(manifest.sha256)) {
    assert.equal(
      createHash("sha256")
        .update(readFileSync(new URL(`upstream/${path}`, app)))
        .digest("hex"),
      expected,
      path,
    );
  }
});
