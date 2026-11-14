import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCatalog } from "../catalog.ts";

test("render cache includes owner and local route when resolving identical relative links", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-links-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "wonder"));
  const put = (file: string, route: string) =>
    writeFile(
      path.join(root, "wonder", file),
      `---\ntitle: Links\npath: ${route}\n---\n[next](child/) [malformed](http://[) [fragment](#part) [odd](%)`,
    );
  await put("a.md", "/a/");
  await put("b.md", "/b/");
  const catalog = createCatalog({
    root,
    authors: [{ id: "wonder", directory: "wonder" }],
  });
  let state = await catalog.refresh();
  assert.equal(state.status, "ready");
  assert.match(
    state.generation!.pages["/spaces/wonder/a"]!.html,
    /href="\/spaces\/wonder\/a\/child\/"/,
  );
  assert.match(
    state.generation!.pages["/spaces/wonder/b"]!.html,
    /href="\/spaces\/wonder\/b\/child\/"/,
  );
  await put("a.md", "/moved/");
  state = await catalog.refresh();
  assert.equal(state.status, "ready");
  assert.match(
    state.generation!.pages["/spaces/wonder/moved"]!.html,
    /href="\/spaces\/wonder\/moved\/child\/"/,
  );
});
