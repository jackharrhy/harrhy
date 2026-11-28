import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";

export const richTextStyles = css({
  "border-radius": "var(--hui-control-radius)",
  border: "0",
  overflow: "visible",
  "& .rich-toolbar": {
    display: "flex",
    "align-items": "center",
    "flex-wrap": "wrap",
    gap: space(0.25),
    border: "0",
    padding: "0",
    background: "none",
    "--hui-button-height": "2rem",
    "--hui-button-padding": "0.25rem 0.5rem",
    "--hui-button-text-size": "0.8125rem",
  },
  '& .rich-toolbar button:hover:not(:disabled), & .rich-toolbar button[aria-pressed="true"]':
    {
      background: "var(--hui-selected-surface)",
    },
  '& .rich-toolbar button[aria-pressed="true"]': {
    color: "var(--hui-accent)",
  },
  "& .rich-toolbar .bold": {
    "font-weight": "800",
  },
  "& .rich-toolbar .italic": {
    "font-style": "italic",
  },
  "& .rich-toolbar .underline": {
    "text-decoration": "underline",
  },
  "& .rich-toolbar .strike": {
    "text-decoration": "line-through",
  },
  "& .rich-text": {
    outline: "none",
    "overflow-wrap": "anywhere",
    "white-space": "pre-wrap",
    background: "var(--hui-surface)",
    "min-height": "46px",
    padding: `${space(1)} ${space(0.5)}`,
    "line-height": "1.6",
  },
  "& .rich-text:focus": {
    "box-shadow": "none",
    outline: "2px solid var(--hui-accent)",
    "outline-offset": "2px",
    "border-radius": "var(--hui-control-radius)",
  },
  "& .rich-text a": {
    color: "var(--hui-accent)",
    "text-decoration": "underline",
  },
  "& .inline-link-form": {
    display: "flex",
    gap: space(0.5),
    width: "100%",
  },
  "& .tiptap p": {
    margin: "0",
  },
  "& .tiptap p + p": {
    "margin-top": "0.5em",
  },
});
