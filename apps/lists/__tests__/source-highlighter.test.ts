import { describe, expect, test } from "bun:test";
import { highlightTemplateSource } from "../src/services/source-highlighter";
import { Parser } from "htmlparser2";

describe("template source highlighting", () => {
  test("HTML, MJML, text and null retain exact decoded source, including large inputs", async () => {
    for (const format of ["html", "mjml", "text"] as const) {
      for (const source of [
        null,
        '\t<p title="🦊">& text</p>\r\n',
        "x".repeat(20_001),
      ]) {
        const html = await highlightTemplateSource(source, format);
        let text = "";
        const parser = new Parser({
          ontext(value) {
            text += value;
          },
        });
        parser.end(html);
        expect(text).toBe(source ?? "(text only)");
      }
    }
  });
  test("highlights markup without turning template source into executable HTML", async () => {
    const highlighted = await highlightTemplateSource(
      '<main>Hello</main></code></pre><script>alert("nope")</script>',
      "html",
    );

    expect(highlighted).toContain('class="hui-highlight github-light"');
    expect(highlighted).toContain("&lt;");
    expect(highlighted).not.toContain("<script>");
    expect(highlighted).not.toContain("</code></pre><script>");
  });
});
