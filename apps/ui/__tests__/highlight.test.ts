import * as assert from "remix/assert";
import { it } from "remix/test";
import { prepareCode } from "../app/public/highlight.tsx";
import { createApp } from "../app/router.tsx";

it("prepares safe Shiki tokens without changing raw source or truncating large inputs", () => {
  const source =
    'const x = "<script>🦊</script>";\r\n\t<Button>Save</Button>\r\n';
  const tokens = prepareCode(source);
  assert.equal(tokens?.map((token) => token.text).join(""), source);
  assert.equal(
    new Set(tokens?.map((token) => token.color).filter(Boolean)).size > 2,
    true,
  );
  assert.equal(prepareCode(source), tokens);
  assert.equal(prepareCode(source, "text"), undefined);
  assert.equal(prepareCode("x".repeat(20_001)), undefined);
  assert.equal(prepareCode("x".repeat(2_001)), undefined);
});

it("server renders real syntax tokens and serves only local Fraunces assets", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const response = await app.fetch(
    new Request("http://localhost/?component=code&theme=brutalist"),
  );
  const html = await response.text();
  assert.match(html, /<span style="color:/);
  assert.match(html, /fraunces-variable\.woff2/);
  assert.ok(!html.includes("fonts.googleapis.com"));
  const font = await app.fetch(
    new Request("http://localhost/assets/ui/fonts/fraunces-variable.woff2"),
  );
  assert.equal(font.status, 200);
  assert.equal(
    new TextDecoder().decode((await font.arrayBuffer()).slice(0, 4)),
    "wOF2",
  );
});
