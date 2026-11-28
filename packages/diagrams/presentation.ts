import type { Element } from "hast";
import { space } from "@harrhy/ui/theme";
import { css } from "remix/component";

export const diagramClass = "harrhy-diagram";
export const sourceLabel = "Diagram source";

export const diagramStyles = css({
  [`& .${diagramClass}`]: {
    marginBlock: space(3),
    overflowX: "auto",
  },
  [`& .${diagramClass} > svg`]: {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    font: "16px sans-serif",
    "--_bg": "var(--hui-surface)",
    "--_fg": "var(--hui-ink)",
    "--_m": "var(--hui-ink)",
    "--_l": "var(--hui-ink)",
    "--_s": "var(--hui-surface)",
    "--_a": "var(--hui-selected-surface)",
    "--_b": "var(--hui-border)",
    "--_c": "var(--hui-ink)",
  },
  [`& .${diagramClass} summary`]: {
    cursor: "pointer",
    minHeight: "1.5rem",
    textDecoration: "underline",
    textUnderlineOffset: ".15em",
    "&:focus-visible": {
      outline: "2px solid var(--hui-focus)",
      outlineOffset: "-2px",
    },
  },
  [`& .${diagramClass} pre`]: { maxWidth: "100%", overflowX: "auto" },
});

export function diagramSource(source: string): Element {
  return {
    type: "element",
    tagName: "details",
    properties: {},
    children: [
      {
        type: "element",
        tagName: "summary",
        properties: {},
        children: [{ type: "text", value: sourceLabel }],
      },
      {
        type: "element",
        tagName: "pre",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "code",
            properties: { className: ["language-mermaid"] },
            children: [{ type: "text", value: source }],
          },
        ],
      },
    ],
  };
}
