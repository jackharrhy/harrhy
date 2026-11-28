import pierreDark from "@pierre/highlights/themes/pierre-dark";
import pierreLight from "@pierre/highlights/themes/pierre-light";
import { createHighlightsPlugin } from "@pierre/words/highlights";
import { createHtmlRenderer, type HtmlOptions } from "@pierre/words/html";

const pierre = createHighlightsPlugin({
  themes: { light: pierreLight, dark: pierreDark },
  defaultColor: false,
});

// Used by both the server formatter and the persistent browser renderer.
export const markdownOptions: HtmlOptions = {
  allowedElements: [
    "p",
    "strong",
    "em",
    "del",
    "a",
    "code",
    "pre",
    "br",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedHtml: {},
  urlTransform(value, key) {
    if (key !== "href") return null;
    const url = URL.parse(value); // No document-relative base.
    return url && ["https:", "http:", "mailto:"].includes(url.protocol)
      ? url.href
      : null;
  },
  components: {
    pre: (html) =>
      html.replace(/^<pre\b/, '<pre tabindex="0" aria-label="Code block"'),
    a: (html) =>
      html.replace(/^<a\b/, '<a target="_blank" rel="noopener noreferrer"'),
  },
  math: false,
  lineNumbers: false,
  controls: { code: { copy: true, download: false } },
  plugins: {
    code: {
      highlight(options) {
        const { code, isIncomplete, language } = options;
        // Only use the stateless hook: never tokenize open or oversized fences.
        // ANSI interprets escape sequences instead of displaying literal source.
        if (
          isIncomplete ||
          code.length > 20_000 ||
          /[^\r\n]{2001}/.test(code) ||
          language.toLowerCase() === "ansi"
        )
          return null;
        return pierre.highlight(options);
      },
    },
  },
};

// Words completes **bold as soon as there is a letter. If a delta ends on
// the opener itself, hold those one or two ambiguous characters for one tick.
// Settlement always receives the original, even when the stars were literal.
export function wordsSource(text: string, streaming: boolean): string {
  return streaming && text.endsWith("*")
    ? text.replace(/(^|[\s([{])\*{1,2}$/, "$1")
    : text;
}

export function markdownHtml(text: string, streaming: boolean): string {
  const renderer = createHtmlRenderer(markdownOptions);
  try {
    return renderer.render(wordsSource(text, streaming), streaming, streaming)
      .html;
  } finally {
    renderer.dispose();
  }
}
