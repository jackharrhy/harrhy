import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCatalog } from "../catalog.ts";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-catalog-"));
  await mkdir(path.join(root, "alice"));
  const put = (name: string, content: string) =>
    writeFile(path.join(root, "alice", name), content);
  const catalog = createCatalog({
    root,
    authors: [{ id: "alice", directory: "alice" }],
  });
  return {
    root,
    put,
    catalog,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
const page = (title: string, route: string, body = "", extra = "") =>
  `---\ntitle: ${title}\npath: ${route}\n${extra}---\n${body}`;

test("rejects traversal, symlinks, malformed YAML, and invalid routes", async () => {
  const f = await fixture();
  try {
    const escaped = createCatalog({
      root: f.root,
      authors: [{ id: "bad", directory: "../elsewhere" }],
    });
    assert.match((await escaped.refresh()).error!, /escapes/);
    await symlink(os.tmpdir(), path.join(f.root, "alice", "outside"));
    assert.match((await f.catalog.refresh()).error!, /Symlink/);
    await rm(path.join(f.root, "alice", "outside"));
    await f.put("bad.md", "---\ntitle: A\ntitle: B\npath: /a\n---\n");
    assert.match((await f.catalog.refresh()).error!, /YAML/);
    await f.put("bad.md", page("Bad", "/../escape"));
    assert.match((await f.catalog.refresh()).error!, /Invalid catalog route/);
    await f.put("bad.md", page("Bad", "/valid", "", "contributors: nobody\n"));
    assert.match((await f.catalog.refresh()).error!, /contributors/);
  } finally {
    await f.cleanup();
  }
});
