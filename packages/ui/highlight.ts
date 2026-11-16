import { codeToTokens, isSupportedLanguage } from "@pierre/highlights";
import githubLight from "@pierre/highlights/themes/github-light";
import githubDark from "@pierre/highlights/themes/github-dark";
import type { CodeToken } from "./code.tsx";

export interface HighlightOptions {
  language?: string;
  theme?: "github-light" | "github-dark";
}

/** Bounded syntax work; the complete original source is always retained. */
export function highlightCode(
  source: string,
  { language = "text", theme = "github-light" }: HighlightOptions = {},
): readonly CodeToken[] {
  if (source.length > 20_000 || /[^\r\n]{2001}/.test(source))
    return [{ text: source }];
  const lang = isSupportedLanguage(language) ? language : "text";
  const result = codeToTokens(source, {
    lang,
    theme: theme === "github-dark" ? githubDark : githubLight,
  });
  const tokens: CodeToken[] = [];
  let offset = 0;
  for (const line of result.tokens) {
    for (const token of line) {
      if (
        token.offset < offset ||
        source.slice(token.offset, token.offset + token.content.length) !==
          token.content
      )
        return [{ text: source }];
      if (token.offset > offset)
        tokens.push({ text: source.slice(offset, token.offset) });
      tokens.push({
        text: token.content,
        italic: Boolean((token.fontStyle ?? 0) & 1),
        bold: Boolean((token.fontStyle ?? 0) & 2),
        color:
          token.color && /^#[0-9a-f]{6}$/i.test(token.color)
            ? token.color
            : undefined,
      });
      offset = token.offset + token.content.length;
    }
  }
  if (offset < source.length) tokens.push({ text: source.slice(offset) });
  return tokens;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

export function highlightPresentation(options: HighlightOptions = {}) {
  const dark = options.theme === "github-dark";
  return {
    className: ["hui-highlight", dark ? "github-dark" : "github-light"],
    style: dark
      ? "color:#e1e4e8;background-color:#24292e"
      : "color:#24292e;background-color:#ffffff",
  };
}

export function highlightTokenStyle(token: CodeToken): string {
  return [
    token.color && /^#[0-9a-f]{6}$/i.test(token.color)
      ? `color:${token.color}`
      : "",
    token.italic === true ? "font-style:italic" : "",
    token.bold === true ? "font-weight:bold" : "",
  ]
    .filter(Boolean)
    .join(";");
}

/** Safe standalone source HTML, not an author-HTML sanitizer. */
export function highlightCodeHtml(
  source: string,
  options: HighlightOptions = {},
): string {
  const tokens = highlightCode(source, options);
  const presentation = highlightPresentation(options);
  return `<pre class="${presentation.className.join(" ")}" style="${presentation.style}"><code>${tokens
    .map((token) => {
      const style = highlightTokenStyle(token);
      return style
        ? `<span style="${style}">${escapeHtml(token.text)}</span>`
        : escapeHtml(token.text);
    })
    .join("")}</code></pre>`;
}
