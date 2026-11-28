import pierreDark from "@pierre/highlights/themes/pierre-dark";
import pierreLight from "@pierre/highlights/themes/pierre-light";
import { createHtmlSession } from "@pierre/words";
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
          /^(ansi|mermaid)$/i.test(language)
        )
          return null;
        return pierre.highlight(options);
      },
    },
  },
};

// Words marks the open tail in its incremental parse, but not in its settled
// formatted HTML. Ask the parser rather than guessing at nested/tilde fences.
export function openMermaidFence(text: string): boolean {
  const { pending } = createHtmlSession().render(text, {
    incomplete: true,
    math: false,
    allowedHtml: {},
  });
  return /<pre data-markdown-incomplete><code class="language-mermaid">/i.test(
    pending,
  );
}

// Words completes **bold as soon as there is a letter. If a delta ends on
// the opener itself, hold those one or two ambiguous characters for one tick.
// Settlement always receives the original, even when the stars were literal.
export function wordsSource(text: string, streaming: boolean): string {
  if (!streaming || !text.endsWith("*")) return text;
  const held = text.replace(/(^|[\s([{])\*{1,2}$/, "$1");
  // A trailing star in a diagram is source, not an emphasis opener.
  return held !== text && /mermaid/i.test(text) && openMermaidFence(text)
    ? text
    : held;
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
