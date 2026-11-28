import { diagramStyles } from "@harrhy/diagrams/presentation";
import { space } from "@harrhy/ui/theme";
import { createDomRenderer } from "@pierre/words/html";
import { css, ref, unsafeHTML, type Handle } from "remix/component";
import { enhanceDiagrams } from "./markdown-diagrams.ts";
import {
  markdownHtml,
  markdownOptions,
  wordsSource,
} from "./markdown-renderer.ts";

const prose = css({
  overflowWrap: "anywhere",
  // Reserve a side slot for the native disclosure. Its source opens below the drawing.
  "& .harrhy-diagram": {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 2.75rem",
    minHeight: "2.75rem",
  },
  "& .harrhy-diagram > svg[role=img]": {
    alignSelf: "center",
    justifySelf: "center",
    // Pele paints node shapes and arrowheads separately. Leave labels and lines in theme ink.
    "& > *": {
      "--_s": "var(--clank-diagram-node, var(--hui-selected-surface))",
      "--_a": "var(--_s)",
      "--_b": "var(--hui-muted)",
    },
  },
  "& .harrhy-diagram > details": {
    gridColumn: "1 / -1",
    "& summary": {
      display: "grid",
      placeItems: "center",
      position: "absolute",
      insetBlockStart: 0,
      insetInlineEnd: 0,
      width: "2.75rem",
      height: "2.75rem",
      color: "var(--hui-muted)",
      fontFamily: "var(--hui-font-mono)",
      fontSize: "0.8125rem",
      textDecoration: "none",
      borderRadius: "var(--hui-control-radius)",
      "&::-webkit-details-marker": { display: "none" },
      "&:hover, &:focus-visible": {
        color: "var(--hui-ink)",
        backgroundColor: "var(--hui-hover-surface)",
      },
      "&:focus-visible": { outlineColor: "currentColor" },
    },
    "&[open] summary": { color: "var(--hui-ink)", fontWeight: 600 },
    "& > [data-markdown=code-block]": { margin: 0 },
  },
  "& p": { margin: "0 0 1em" },
  "& > :last-child": { marginBlockEnd: 0 },
  // Pi-brand Elanor Link and soft InlineCode, scoped to Words prose.
  "& a[href]": {
    color: "light-dark(oklch(48.15% 0.075 231.49), oklch(74.2% 0.077 231.49))",
    textDecorationLine: "underline",
    textDecorationThickness: "from-font",
    textUnderlinePosition: "from-font",
    textUnderlineOffset: "0.1875rem",
    "&:hover": { textDecorationThickness: "10%" },
    "&:focus-visible": {
      outline: "1px solid var(--hui-ink)",
      outlineOffset: "2px",
      borderRadius: "0.1875rem",
    },
  },
  // Words marks fenced code with the same data-markdown value, inside pre.
  '& :not(pre) > code[data-markdown="code"]': {
    color: "var(--hui-ink)",
    backgroundColor:
      "color-mix(in srgb, var(--hui-selected-surface) 92%, gray)",
    font: "inherit",
    fontFamily: "var(--hui-font-mono)",
    fontSize: "0.9375em",
    overflowWrap: "break-word",
    padding: `${space(0.125)} ${space(0.625)}`,
    borderRadius: "0.1875rem",
    "@media (forced-colors: active)": { outline: "1px solid CanvasText" },
  },
  "& blockquote": {
    marginInline: 0,
    paddingInlineStart: space(1.5),
    borderInlineStart: "2px solid var(--hui-border)",
  },
  '& [data-markdown="code-block"]': {
    backgroundColor: "light-dark(#fff, #0a0a0a)",
    color: "light-dark(#0a0a0a, #fafafa)",
    border: "1px solid var(--hui-border)",
    borderRadius: "0.25rem",
    padding: space(1.5),
    marginBlock: "0 1em",
  },
  '& [data-markdown="code-header"]': {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space(1),
    "& > span:first-child": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    fontSize: "0.75rem",
    marginBlockEnd: space(0.75),
  },
  "& [data-code-action='copy']": {
    color: "inherit",
    font: "inherit",
    border: "1px solid transparent",
    minWidth: "4rem",
    borderRadius: "0.25rem",
    backgroundColor: "transparent",
    padding: `${space(0.25)} ${space(1)}`,
    minHeight: "1.5rem",
    cursor: "pointer",
    "&:hover:not(:disabled)": { textDecoration: "underline" },
    "&:focus-visible": { outline: "2px solid currentColor" },
    "&:disabled": { cursor: "default" },
  },
  // Limit Lab lightness for small text on the two editor backgrounds.
  // Pierre Light and Dark use the same bold and italic scopes.
  '& [data-markdown="code-block"] code span[style]': {
    color:
      "light-dark(lab(from var(--hls-light) min(l, 47) a b), lab(from var(--hls-dark) max(l, 52) a b))",
    fontStyle: "var(--hls-light-font-style, normal)",
    fontWeight: "var(--hls-light-font-weight, inherit)",
  },
  '& [data-markdown="code-block"] pre': {
    margin: 0,
    maxHeight: "28rem",
    overflow: "auto",
    tabSize: 2,
    fontSize: "0.875em",
  },
  "& table": {
    display: "block",
    overflowX: "auto",
    borderCollapse: "collapse",
  },
  "& th, & td": {
    padding: `${space(0.5)} ${space(1)}`,
    border: "1px solid var(--hui-border)",
  },
});

export function Markdown(
  handle: Handle<{ text: string; streaming?: boolean }>,
) {
  let update: (() => void) | undefined;
  const host = ref((node: HTMLDivElement, signal) => {
    const renderer = createDomRenderer(node, markdownOptions);
    let enhancement: AbortController | undefined;
    renderer.connect();
    update = () => {
      enhancement?.abort();
      const { text, streaming = false } = handle.props;
      renderer.update(wordsSource(text, streaming), streaming, streaming);
      if (!streaming) {
        enhancement = new AbortController();
        void enhanceDiagrams(node, text, enhancement.signal);
      }
    };
    update();
    signal.addEventListener(
      "abort",
      () => {
        enhancement?.abort();
        renderer.disconnect();
        update = undefined;
      },
      { once: true },
    );
  });
  let previousText: string | undefined;
  let previousStreaming: boolean | undefined;
  return () => {
    const { text, streaming = false } = handle.props;
    if (update && (text !== previousText || streaming !== previousStreaming))
      handle.queueTask(() => update?.());
    previousText = text;
    previousStreaming = streaming;
    // Remix assigns innerHTML even while hydrating. Only supply it on the
    // server; Words adopts those children and owns them until unmount.
    return (
      <div
        data-markdown="root"
        data-streaming={streaming ? "" : undefined}
        mix={[prose, diagramStyles, host]}
        innerHTML={
          typeof document === "undefined"
            ? unsafeHTML(markdownHtml(text, streaming))
            : undefined
        }
      />
    );
  };
}
