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

/** Safe standalone source HTML, not an author-HTML sanitizer. */
export function highlightCodeHtml(
  source: string,
  options: HighlightOptions = {},
): string {
  const tokens = highlightCode(source, options);
  return `<pre class="hui-highlight ${options.theme === "github-dark" ? "github-dark" : "github-light"}"><code>${tokens
    .map((token) =>
      token.color
        ? `<span style="color:${token.color}">${escapeHtml(token.text)}</span>`
        : escapeHtml(token.text),
    )
    .join("")}</code></pre>`;
}
