import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  symlink,
  rename,
} from "node:fs/promises";
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

test("publishes immutable routes, backlinks and search from curated authors only", async () => {
  const f = await fixture();
  try {
    await f.put(
      "a.md",
      page(
        "Alpha",
        "/alpha",
        "[Beta](/old#section)",
        "contributors: [Alice, Bob]\n",
      ),
    );
    await f.put(
      "b.md",
      page("Beta", "/beta", "Searchable content", "aliases: [/old]\n"),
    );
    await mkdir(path.join(f.root, "private"));
    await writeFile(
      path.join(f.root, "private", "bad.md"),
      "not valid metadata",
    );
    const { generation: g, status } = await f.catalog.refresh();
    assert.equal(status, "ready");
    assert.ok(g);
    assert.equal(g.routes["/spaces/alice/old"], "/spaces/alice/beta");
    assert.deepEqual(g.backlinks["/spaces/alice/beta"], [
      "/spaces/alice/alpha/",
    ]);
    assert.deepEqual(g.pages["/spaces/alice/alpha"]?.contributors, [
      "Alice",
      "Bob",
    ]);
    assert.match(
      g.search.find((entry) => entry.path === "/spaces/alice/beta/")!.text,
      /Searchable content/,
    );
    assert.ok(Object.isFrozen(g.pages["/spaces/alice/alpha"]!.links));
    assert.ok(Object.isFrozen(g.routes));
    assert.equal(Object.keys(g.pages).length, 2);
  } finally {
    await f.cleanup();
  }
});

test("invalid refresh retains every old index and recovery replaces the generation", async () => {
  const f = await fixture();
  try {
    await f.put("a.md", page("Alpha", "/alpha"));
    const initial = await f.catalog.refresh();
    await f.put("b.md", page("Conflict", "/alpha"));
    const stale = await f.catalog.refresh();
    assert.equal(stale.status, "stale");
    assert.equal(stale.generation, initial.generation);
    assert.match(stale.error!, /Duplicate/);
    await f.put("b.md", page("Beta", "/beta"));
    const recovered = await f.catalog.refresh();
    assert.equal(recovered.status, "ready");
    assert.equal(recovered.generation!.id, 2);
    assert.equal(Object.keys(initial.generation!.pages).length, 1);
  } finally {
    await f.cleanup();
  }
});

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

test("resolves relative backlinks, canonicalizes parent aliases and reuses unchanged generations", async () => {
  const f = await fixture();
  try {
    await f.put(
      "a.md",
      page(
        "Alpha",
        "/alpha",
        "[Beta](../b%65ta/?q=1#part) [External](https://example.com/beta/)",
        "parent: /old\n",
      ),
    );
    await f.put("b.md", page("Beta", "/beta", "", "aliases: [/old]\n"));
    const first = await f.catalog.refresh();
    assert.equal(
      first.generation?.pages["/spaces/alice/alpha"]?.parent,
      "/spaces/alice/beta/",
    );
    assert.deepEqual(first.generation?.backlinks["/spaces/alice/beta"], [
      "/spaces/alice/alpha/",
    ]);
    assert.equal((await f.catalog.refresh()).generation, first.generation);
    await f.put("a.md", "invalid");
    assert.equal((await f.catalog.refresh()).status, "stale");
    await f.put(
      "a.md",
      page(
        "Alpha",
        "/alpha",
        "[Beta](../b%65ta/?q=1#part) [External](https://example.com/beta/)",
        "parent: /old\n",
      ),
    );
    assert.equal((await f.catalog.refresh()).generation, first.generation);
    assert.equal(f.catalog.read().status, "ready");
  } finally {
    await f.cleanup();
  }
});

test("periodic rescan recovers author directory replacement", async () => {
  const f = await fixture();
  let close: (() => void) | undefined;
  try {
    await f.put("a.md", page("Alpha", "/alpha"));
    await f.catalog.refresh();
    close = f.catalog.watch();
    await rename(path.join(f.root, "alice"), path.join(f.root, "old"));
    await mkdir(path.join(f.root, "alice"));
    await f.put("a.md", page("Beta", "/beta"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await f.put("a.md", page("Gamma", "/gamma"));
    const deadline = Date.now() + 6500;
    while (
      !f.catalog.read().generation?.pages["/spaces/alice/gamma"] &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(f.catalog.read().generation?.pages["/spaces/alice/gamma"]);
  } finally {
    close?.();
    await f.cleanup();
  }
});

test("rejects reserved routes and parent cycles", async () => {
  const f = await fixture();
  try {
    for (const reserved of ["/search/", "/authors/wonder/", "/healthz"]) {
      await f.put("a.md", page("Reserved", reserved));
      assert.match((await f.catalog.refresh()).error!, /Reserved/);
    }
    await f.put("a.md", page("Alpha", "/alpha", "", "parent: /beta\n"));
    await f.put("b.md", page("Beta", "/beta", "", "parent: /alpha\n"));
    assert.match((await f.catalog.refresh()).error!, /Cyclic/);
  } finally {
    await f.cleanup();
  }
});

test("explicit watcher rebuilds on rename and can be closed", async () => {
  const f = await fixture();
  let close: (() => void) | undefined;
  try {
    await f.put("a.md", page("Alpha", "/alpha"));
    await f.catalog.refresh();
    close = f.catalog.watch();
    await f.put("replacement.tmp", page("Beta", "/beta"));
    await rename(
      path.join(f.root, "alice", "replacement.tmp"),
      path.join(f.root, "alice", "a.md"),
    );
    const deadline = Date.now() + 4000;
    while (
      !f.catalog.read().generation?.pages["/spaces/alice/beta"] &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(f.catalog.read().generation?.pages["/spaces/alice/beta"]);
    assert.equal(
      f.catalog.read().generation?.pages["/spaces/alice/alpha"],
      undefined,
    );
  } finally {
    close?.();
    await f.cleanup();
  }
});
