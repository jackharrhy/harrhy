import { highlightCode, highlightTokenStyle } from "@harrhy/ui/highlight";
import {
  createHtmlRenderer,
  escapeHtml,
  type HtmlOptions,
} from "@pierre/words/html";

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
      highlight({ code, language, isIncomplete }) {
        // Let Words display an open fence; tokenize once it closes, within
        // the shared highlighter's source/line limits.
        if (isIncomplete) return null;
        return highlightCode(code, { language, theme: "github-dark" })
          .map((token) => {
            // Lift GitHub Dark's muted comment color on the fixed code surface.
            const style = highlightTokenStyle(
              token.color === "#6a737d"
                ? { ...token, color: "#9ca5ae" }
                : token,
            );
            const text = escapeHtml(token.text);
            return style ? `<span style="${style}">${text}</span>` : text;
          })
          .join("");
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
