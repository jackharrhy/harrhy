import { createHighlighterCoreSync } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import tsx from "@shikijs/langs/tsx";
import githubLight from "@shikijs/themes/github-light";
import {
  CodeBlock,
  type CodeBlockProps,
  type CodeToken,
} from "@harrhy/ui/code";
import type { Handle } from "remix/component";

// The same small grammar/theme and native-regexp engine run during SSR and updates.
const highlighter = createHighlighterCoreSync({
  themes: [githubLight],
  langs: [tsx],
  engine: createJavaScriptRegexEngine(),
});
// Darker Github-light accents remain readable on all three light theme surfaces.
const syntaxColors: Record<string, string> = {
  "#22863a": "#1b7131",
  "#d73a49": "#b92d3b",
  "#e36209": "#a54205",
  "#fafbfc": "#24292e",
  "#f6f8fa": "#24292e",
};
function syntaxColor(color: string | undefined) {
  return color ? (syntaxColors[color.toLowerCase()] ?? color) : undefined;
}
const cache = new Map<string, readonly CodeToken[]>();
export function prepareCode(
  source: string,
  language = "tsx",
): readonly CodeToken[] | undefined {
  if (
    language !== "tsx" ||
    source.length > 20_000 ||
    source.split(/\r?\n/).some((line) => line.length > 2_000)
  )
    return undefined;
  const cached = cache.get(source);
  if (cached) return cached;
  const lines = highlighter.codeToTokens(source, {
    lang: "tsx",
    theme: "github-light",
  }).tokens;
  // Slice by Shiki's offsets, not reconstructed lines: CRLF and final newlines stay exact.
  const tokens: CodeToken[] = [];
  let offset = 0;
  for (const line of lines)
    for (const token of line) {
      if (token.offset > offset)
        tokens.push({ text: source.slice(offset, token.offset) });
      tokens.push({ text: token.content, color: syntaxColor(token.color) });
      offset = token.offset + token.content.length;
    }
  if (offset < source.length) tokens.push({ text: source.slice(offset) });
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(source, tokens);
  return tokens;
}
export function HighlightedCode(handle: Handle<CodeBlockProps>) {
  return () => (
    <CodeBlock
      {...handle.props}
      tokens={prepareCode(handle.props.source, handle.props.language)}
    />
  );
}
