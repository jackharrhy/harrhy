import { createDomRenderer } from "@pierre/words/html";
import { css, ref, unsafeHTML, type Handle } from "remix/component";
import {
  markdownHtml,
  markdownOptions,
  wordsSource,
} from "./markdown-renderer.ts";

const prose = css({
  overflowWrap: "anywhere",
  "& p": { margin: "0 0 1em" },
  "& > :last-child": { marginBlockEnd: 0 },
  "& a": { color: "inherit", textUnderlineOffset: "3px" },
  "& blockquote": {
    marginInline: 0,
    paddingInlineStart: "12px",
    borderInlineStart: "2px solid var(--hui-border)",
  },
  '& [data-markdown="code-block"]': {
    backgroundColor: "#0d1117",
    color: "#e1e4e8",
    borderRadius: "4px",
    padding: "10px 12px",
    marginBlock: "0 1em",
  },
  '& [data-markdown="code-header"]': {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    fontSize: "12px",
    marginBlockEnd: "6px",
  },
  "& [data-code-action='copy']": {
    color: "inherit",
    font: "inherit",
    border: "1px solid #58616b",
    borderRadius: "4px",
    backgroundColor: "transparent",
    padding: "2px 8px",
    minHeight: "24px",
    cursor: "pointer",
  },
  "& pre": {
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
  "& th, & td": { padding: "4px 8px", border: "1px solid var(--hui-border)" },
});

export function Markdown(
  handle: Handle<{ text: string; streaming?: boolean }>,
) {
  let renderer: ReturnType<typeof createDomRenderer> | undefined;
  const update = () => {
    const { text, streaming = false } = handle.props;
    renderer?.update(wordsSource(text, streaming), streaming, streaming);
  };
  const host = ref((node: HTMLDivElement, signal) => {
    renderer = createDomRenderer(node, markdownOptions);
    renderer.connect();
    update();
    signal.addEventListener(
      "abort",
      () => {
        renderer?.disconnect();
        renderer = undefined;
      },
      { once: true },
    );
  });
  let previousText: string | undefined;
  let previousStreaming: boolean | undefined;
  return () => {
    const { text, streaming = false } = handle.props;
    if (renderer && (text !== previousText || streaming !== previousStreaming))
      handle.queueTask(update);
    previousText = text;
    previousStreaming = streaming;
    // Remix assigns innerHTML even while hydrating. Only supply it on the
    // server; Words adopts those children and owns them until unmount.
    return (
      <div
        data-markdown="root"
        data-streaming={streaming ? "" : undefined}
        mix={[prose, host]}
        innerHTML={
          typeof document === "undefined"
            ? unsafeHTML(markdownHtml(text, streaming))
            : undefined
        }
      />
    );
  };
}
