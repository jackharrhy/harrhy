import assert from "node:assert/strict";
import { test } from "node:test";
import { documentTitle } from "../app/ui.tsx";
import { pageDirectory } from "../app/navigation.ts";

test("directory prefers metadata, falls back to actual route ancestors", () => {
  const home = "/spaces/alpha/";
  const pages = [
    { path: home, title: "Introduction" },
    { path: `${home}guide/`, title: "Guide" },
    { path: `${home}guide/reference/`, title: "Reference" },
    { path: `${home}guide/reference/deep/`, title: "Deep & exact" },
    { path: `${home}elsewhere/`, title: "Explicit child", parent: `${home}guide/reference/` },
    { path: `${home}missing/leaf/`, title: "No invented ancestor" },
  ];
  const tree = pageDirectory(pages, home);
  assert.deepEqual(
    tree.map((entry) => entry.title),
    ["Guide", "No invented ancestor"],
  );
  assert.deepEqual(
    tree[0]!.children[0]!.children.map((entry) => entry.title),
    ["Deep & exact", "Explicit child"],
  );
  assert.deepEqual(pageDirectory(pages.toReversed(), home), pageDirectory(pages, home));
});

test("URL fallback cannot introduce a cycle with explicit parents", () => {
  const tree = pageDirectory(
    [
      { path: "/a/", title: "A", parent: "/a/b/" },
      { path: "/a/b/", title: "B" },
    ],
    "/",
  );
  assert.equal(tree.length, 1);
  assert.equal(tree[0]!.children.length, 1);
});

test("browser titles have one site suffix and no globe prefix without changing meaningful page names", () => {
  assert.equal(documentTitle("Guide & reference"), "Guide & reference - Atlas");
  assert.equal(documentTitle("🌎 🌎 Guide - Atlas - Atlas"), "Guide - Atlas");
  assert.equal(documentTitle("Atlas comments: reference"), "Atlas comments: reference - Atlas");
});
