import { highlightCode } from "@harrhy/ui/highlight";
import {
  CodeBlock,
  type CodeBlockProps,
  type CodeToken,
} from "@harrhy/ui/code";
import type { Handle } from "remix/component";

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
  const tokens = highlightCode(source, { language, theme: "github-light" }).map(
    (token) => ({ ...token, color: syntaxColor(token.color) }),
  );
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
