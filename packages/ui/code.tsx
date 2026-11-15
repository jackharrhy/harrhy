import { css, type Handle } from "remix/component";
import { focusStyles, visuallyHiddenStyles } from "./recipes.ts";

export interface CodeToken {
  text: string;
  /** Optional caller-prepared six-digit sRGB color. No HTML or arbitrary CSS. */
  color?: string;
}

export interface CodeBlockProps {
  label: string;
  source: string;
  /** Caller-prepared tokens are used only when they exactly reproduce source. */
  tokens?: readonly CodeToken[];
  language?: string;
}

export type DiffLine =
  | { kind: "context"; text: string; oldLine?: number; newLine?: number }
  | { kind: "remove"; text: string; oldLine?: number }
  | { kind: "add"; text: string; newLine?: number };

export interface CodeDiffProps {
  label: string;
  lines: readonly DiffLine[];
}

const figureStyles = css({
  margin: 0,
  minWidth: 0,
  maxWidth: "100%",
  color: "var(--hui-ink)",
});
const captionStyles = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--hui-space)",
  marginBottom: "0.5em",
  fontFamily: "var(--hui-font-ui)",
});
const metadataStyles = css({
  color: "var(--hui-muted)",
  fontSize: "0.85em",
  fontFamily: "var(--hui-font-detail)",
});
const preStyles = css({
  boxSizing: "border-box",
  margin: 0,
  maxWidth: "100%",
  maxHeight: "28rem",
  overflow: "auto",
  padding: "var(--hui-space)",
  border: "var(--hui-border-width) solid var(--hui-border)",
  borderRadius: "var(--hui-panel-radius)",
  backgroundColor: "var(--hui-surface)",
  color: "var(--hui-ink)",
  fontFamily: "var(--hui-font-mono)",
  fontSize: "0.875em",
  lineHeight: 1.6,
  tabSize: 2,
  whiteSpace: "pre",
  overflowWrap: "normal",
  direction: "ltr",
  textAlign: "left",
  "& code": { font: "inherit" },
});
const diffRowStyles = css({
  display: "block",
  minWidth: "max-content",
  "&[data-change='add']": {
    color: "var(--hui-success)",
    backgroundColor: "var(--hui-success-surface)",
  },
  "&[data-change='remove']": {
    color: "var(--hui-danger)",
    backgroundColor: "var(--hui-danger-surface)",
  },
  "@media (forced-colors: active)": {
    "&[data-change]": { color: "CanvasText", backgroundColor: "Canvas" },
  },
});
const numberStyles = css({
  display: "inline-block",
  minWidth: "4ch",
  paddingInlineEnd: "1ch",
  textAlign: "right",
  userSelect: "none",
  fontVariantNumeric: "tabular-nums",
});

export function CodeBlock(handle: Handle<CodeBlockProps>) {
  return () => {
    const { label, source, language, tokens } = handle.props;
    const prepared =
      tokens?.map((token) => token.text).join("") === source
        ? tokens
        : undefined;
    return (
      <figure mix={figureStyles}>
        <figcaption mix={captionStyles}>
          <span>{label}</span>
          {language && <span mix={metadataStyles}>{language}</span>}
        </figcaption>
        <pre
          role="region"
          aria-label={label}
          tabIndex={0}
          mix={[preStyles, focusStyles]}
        >
          <code>
            {prepared
              ? prepared.map((token) => (
                  <span
                    style={
                      token.color && /^#[0-9a-f]{6}$/i.test(token.color)
                        ? { color: token.color }
                        : undefined
                    }
                  >
                    {token.text}
                  </span>
                ))
              : source}
          </code>
        </pre>
      </figure>
    );
  };
}

export function CodeDiff(handle: Handle<CodeDiffProps>) {
  return () => {
    const { label, lines } = handle.props;
    return (
      <figure mix={figureStyles}>
        <figcaption mix={captionStyles}>
          <span>{label}</span>
          <span mix={metadataStyles}>Unified diff · − removed · + added</span>
        </figcaption>
        <pre
          role="region"
          aria-label={label}
          tabIndex={0}
          mix={[preStyles, focusStyles]}
        >
          <code>
            {lines.map((line) => {
              const oldLine = line.kind === "add" ? undefined : line.oldLine;
              const newLine = line.kind === "remove" ? undefined : line.newLine;
              return (
                <span data-change={line.kind} mix={diffRowStyles}>
                  <span aria-hidden="true" mix={numberStyles}>
                    {oldLine}
                  </span>
                  <span aria-hidden="true" mix={numberStyles}>
                    {newLine}
                  </span>
                  <span aria-hidden="true">
                    {line.kind === "add"
                      ? "+ "
                      : line.kind === "remove"
                        ? "− "
                        : "  "}
                  </span>
                  <span mix={visuallyHiddenStyles}>
                    {line.kind === "add"
                      ? "Added"
                      : line.kind === "remove"
                        ? "Removed"
                        : "Context"}
                    {oldLine !== undefined && ` old line ${oldLine}`}
                    {newLine !== undefined && ` new line ${newLine}`}
                    {": "}
                  </span>
                  {line.text}
                  {"\n"}
                </span>
              );
            })}
          </code>
        </pre>
      </figure>
    );
  };
}
