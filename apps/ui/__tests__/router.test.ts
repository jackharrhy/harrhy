import * as assert from "remix/assert";
import { it } from "remix/test";
import { stories } from "../app/public/explorer.tsx";
import { createApp } from "../app/router.tsx";
it("rejects unknown hosts before routes and assets", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  for (const path of ["/", "/healthz", "/assets/ui/showcase.tsx"]) {
    const response = await app.fetch(
      new Request("http://unexpected.test" + path),
    );
    assert.equal(response.status, 404);
  }
});
it("renders a native filtered fixture and escapes query text", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const response = await app.fetch(
    new Request("http://localhost/explorer?theme=dial&q=%3Cscript%3E"),
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /data-theme="dial"/);
  assert.match(html, /No components found/);
  assert.ok(!html.includes("<script><"));
  assert.match(html, /method="get"/);
});
it("does not expose server source", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const response = await app.fetch(
    new Request("http://localhost/assets/ui/../router.tsx"),
  );
  assert.equal(response.status, 404);
});

it("registers the synthetic Sluggers scene and gates its private font stylesheet", async (t) => {
  for (const sluggersPrivateFonts of [false, true]) {
    const app = createApp(undefined, { sluggersPrivateFonts });
    t.after(() => app.close());
    for (const path of [
      "/scenes/sluggers?theme=basic",
      "/scenes/forms",
      "/explorer/button?scene=sluggers",
    ]) {
      const response = await app.fetch(new Request(`http://localhost${path}`));
      assert.equal(response.status, 200);
      const html = await response.text();
      const isSluggers = path.startsWith("/scenes/sluggers");
      assert.equal(
        html.includes('href="/assets/ui/sluggers/fonts.css"'),
        sluggersPrivateFonts,
      );
      if (isSluggers) {
        assert.match(html, /Sluggers/);
        assert.match(html, /Standings/);
        assert.match(html, /Lil Slug Crew/);
      }
    }
  }
});

it("renders each Explorer preview and its source with the selected Sluggers theme", async (t) => {
  const app = createApp(undefined, { sluggersPrivateFonts: false });
  t.after(() => app.close());
  for (const { id } of stories) {
    const response = await app.fetch(
      new Request("http://localhost/explorer/" + id + "?theme=scorebook"),
    );
    assert.equal(response.status, 200, id);
    const html = await response.text();
    assert.ok(
      html.includes('data-preview="' + id + '" data-theme="scorebook"'),
      id,
    );
    // Syntax highlighting wraps individual tokens; compare the rendered source text.
    const source = html.match(
      /<[^>]+ data-source[^>]*>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/,
    )?.[1];
    assert.match(
      source?.replace(/<[^>]+>/g, "") ?? "",
      /themeStyles\(sluggersTheme\)/,
      id,
    );
  }
});

it("redirects old scene links and retains theme and density in shared navigation", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const result = await app.fetch(
    new Request(
      "http://localhost/?view=scenes&scene=clank&theme=graphite&density=compact",
    ),
  );
  assert.equal(result.status, 302);
  const target = result.headers.get("Location");
  assert.equal(target, "/scenes/clank?theme=graphite&density=compact");
  const clank = await app.fetch(new Request(`http://localhost${target}`));
  assert.equal(clank.status, 200);
  const html = await clank.text();
  assert.match(html, /data-skin="graphite"/);
  assert.match(
    html,
    /--hui-field-gap: calc\(var\(--hui-space-unit, 0\.5rem\) \* 0\.75\)/,
  );
  assert.match(
    html,
    /href="\/explorer\/field\?theme=graphite&amp;density=compact/,
  );
});
