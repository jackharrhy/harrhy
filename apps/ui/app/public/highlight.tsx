import { highlightCode } from "@harrhy/ui/highlight";
import {
  CodeBlock,
  type CodeBlockProps,
  type CodeToken,
} from "@harrhy/ui/code";
import type { Handle } from "remix/component";

const lightColors: Record<string, string> = {
  "#22863a": "#1b7131",
  "#d73a49": "#b92d3b",
  "#e36209": "#a54205",
  "#fafbfc": "#24292e",
  "#f6f8fa": "#24292e",
};
const darkColors: Record<string, string> = {
  "#6a737d": "#d6e3fa",
  "#f97583": "#ffbcc4",
  "#79b8ff": "#a9cfff",
  "#b392f0": "#d1b8ff",
};
const cache = new Map<string, readonly CodeToken[]>();
export function prepareCode(
  source: string,
  language = "tsx",
  colorScheme: "light" | "dark" = "light",
): readonly CodeToken[] | undefined {
  if (
    language !== "tsx" ||
    source.length > 20_000 ||
    source.split(/\r?\n/).some((line) => line.length > 2_000)
  )
    return undefined;
  const key = `${colorScheme}:${source}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const colors = colorScheme === "dark" ? darkColors : lightColors;
  const tokens = highlightCode(source, {
    language,
    theme: colorScheme === "dark" ? "github-dark" : "github-light",
  }).map((token) => ({
    ...token,
    color: token.color
      ? (colors[token.color.toLowerCase()] ?? token.color)
      : undefined,
  }));
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(key, tokens);
  return tokens;
}
export function HighlightedCode(
  handle: Handle<CodeBlockProps & { colorScheme?: "light" | "dark" }>,
) {
  return () => {
    const { colorScheme, ...props } = handle.props;
    return (
      <CodeBlock
        {...props}
        tokens={prepareCode(props.source, props.language, colorScheme)}
      />
    );
  };
}
