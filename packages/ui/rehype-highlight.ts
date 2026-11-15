import type { Element, Root, ElementContent } from "hast";
import { highlightCode, type HighlightOptions } from "./highlight.ts";

export interface RehypeHighlightOptions extends Omit<
  HighlightOptions,
  "language"
> {
  languageAliases?: Readonly<Record<string, string>>;
}

/** Run after the host's author-HTML sanitizer, before serialization/projection. */
export function rehypeHighlight(options: RehypeHighlightOptions = {}) {
  return (tree: Root): void => {
    function walk(node: Root | Element): void {
      if (node.type === "element" && node.tagName === "pre") {
        const code = node.children.length === 1 ? node.children[0] : undefined;
        if (
          code?.type === "element" &&
          code.tagName === "code" &&
          code.children.every((child) => child.type === "text")
        ) {
          const source = code.children
            .map((child) => (child.type === "text" ? child.value : ""))
            .join("");
          const classes = code.properties.className;
          const languageClass = Array.isArray(classes)
            ? classes.find(
                (name) =>
                  typeof name === "string" && name.startsWith("language-"),
              )
            : undefined;
          const language =
            typeof languageClass === "string" ? languageClass.slice(9) : "text";
          code.children = highlightCode(source, {
            theme: options.theme,
            language: options.languageAliases?.[language] ?? language,
          }).map((token): ElementContent =>
            token.color
              ? {
                  type: "element",
                  tagName: "span",
                  properties: { style: `color:${token.color}` },
                  children: [{ type: "text", value: token.text }],
                }
              : { type: "text", value: token.text },
          );
          node.properties.className = [
            "hui-highlight",
            options.theme ?? "github-light",
          ];
          return;
        }
      }
      for (const child of node.children)
        if (child.type === "element") walk(child);
    }
    walk(tree);
  };
}
