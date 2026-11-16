import type { Element, Root, ElementContent } from "hast";
import {
  highlightCode,
  highlightPresentation,
  highlightTokenStyle,
  type HighlightOptions,
} from "./highlight.ts";

export interface RehypeHighlightOptions extends Omit<
  HighlightOptions,
  "language"
> {
  languageAliases?: Readonly<Record<string, string>>;
}

/** Run after the host's author-HTML sanitizer, before serialization/projection. */
export function rehypeHighlight(options: RehypeHighlightOptions = {}) {
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
        }).map((token): ElementContent => {
          const style = highlightTokenStyle(token);
          return style
            ? {
                type: "element",
                tagName: "span",
                properties: { style },
                children: [{ type: "text", value: token.text }],
              }
            : { type: "text", value: token.text };
        });
        const presentation = highlightPresentation(options);
        node.properties.className = presentation.className;
        node.properties.style = presentation.style;
        return;
      }
    }
    for (const child of node.children)
      if (child.type === "element") walk(child);
  }
  return (tree: Root): Root => {
    walk(tree);
    return tree;
  };
}
