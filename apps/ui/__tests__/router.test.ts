import * as assert from "remix/assert";
import { it } from "remix/test";
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
    new Request("http://localhost/?theme=tactile&q=%3Cscript%3E"),
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /data-theme="tactile"/);
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
      "/?view=scenes&scene=sluggers&theme=clean",
      "/?view=scenes&scene=forms",
      "/?component=button&scene=sluggers",
    ]) {
      const response = await app.fetch(new Request(`http://localhost${path}`));
      assert.equal(response.status, 200);
      const html = await response.text();
      const isSluggers = path.includes("view=scenes&scene=sluggers");
      assert.equal(
        html.includes('href="/assets/ui/sluggers/fonts.css"'),
        sluggersPrivateFonts && isSluggers,
      );
      if (isSluggers) {
        assert.match(html, /Sluggers/);
        assert.match(html, /Standings/);
        assert.match(html, /Lil Slug Crew/);
      }
    }
  }
});
