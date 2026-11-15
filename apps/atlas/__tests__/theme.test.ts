import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAtlas } from "../app/router.tsx";

test("SSR themes persist through native forms without changing scoped content", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-theme-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "wonder"));
  await writeFile(
    path.join(root, "wonder", "note.md"),
    "---\ntitle: Example research\npath: /research/\n---\nA searchable observation.\n",
  );
  const { router } = await createAtlas(root);
  for (const theme of ["clean", "tactile", "brutalist"]) {
    const response = await router.fetch(
      `https://atlas.example/spaces/wonder/search/?q=observation&theme=${theme}`,
    );
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-security-policy")!,
      /font-src 'self'/,
    );
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    const html = await response.text();
    assert.match(html, new RegExp(`data-theme="${theme}"`));
    assert.match(html, /name="q" value="observation"/);
    assert.match(html, /Example research/);
    assert.match(html, /aria-current="page"[^>]*[^]*?Wonder/);
    assert.doesNotMatch(html, /role="tab"|<script/);
    assert.equal(html.includes('href="/fonts.css"'), theme === "brutalist");
    const next = await router.fetch(
      new Request("https://atlas.example/spaces/infra/", {
        headers: { Cookie: cookie.split(";")[0]! },
      }),
    );
    assert.match(await next.text(), new RegExp(`data-theme="${theme}"`));
  }
  const invalid = await router.fetch("http://localhost/?theme=arbitrary");
  assert.equal(invalid.headers.get("set-cookie"), null);
  assert.match(await invalid.text(), /data-theme="clean"/);
  for (const resource of [
    "/fonts.css",
    "/fonts/fraunces-variable.woff2",
    "/fonts/ibm-plex-sans-latin.woff2",
    "/fonts/ibm-plex-mono-latin.woff2",
  ]) {
    const response = await router.fetch(`http://localhost${resource}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /private/);
  }
  assert.equal(
    (await router.fetch("http://localhost/app/theme.ts")).status,
    404,
  );
});
