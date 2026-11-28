import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";

export const adminEditorStyles = css({
  "& .editor-heading": {
    display: "flex",
    "justify-content": "space-between",
    "align-items": "center",
    gap: space(3),
    "margin-bottom": "24px",
  },
  "& .editor-heading h1": {
    "font-size": "28px",
    margin: `${space(1.25)} ${space(0)} ${space(0.625)}`,
  },
  "& .back-link": {
    "font-size": "12px",
    color: "var(--muted)",
  },
  "& .editor-heading > .muted": {
    "font-size": "12px",
  },
  "& .editor-actions": {
    display: "flex",
    "align-items": "center",
    gap: space(2),
    "flex-wrap": "wrap",
  },
  "& .save-status": {
    "font-size": "12px",
    color: "var(--accent)",
  },
  "& .save-status.pending": {
    color: "var(--muted)",
  },
  "& .save-status.failed": {
    color: "var(--danger)",
  },
  "& .editor-toolbar": {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: space(1.75),
    "flex-wrap": "wrap",
    border: "0px",
    padding: `${space(0.75)} ${space(0)}`,
    "margin-bottom": "18px",
  },
  "& .editor-toolbar > div": {
    display: "flex",
    "align-items": "center",
    gap: space(1.25),
  },
  "& .editor-toolbar .muted": {
    "font-size": "12px",
    "margin-left": "4px",
  },
  "& .editor-canvas": {
    "min-width": "0px",
  },
  "& .page-title-field": {
    border: "1px solid var(--line)",
    "border-radius": "var(--radius)",
    padding: `${space(0)} ${space(0)} ${space(1.5)}`,
    background: "none",
  },
  "& .page-title-field > input": {
    "font-weight": "550",
    "letter-spacing": "-0.5px",
    "font-size": "18px",
  },
  "& .block-card": {
    border: "1px solid var(--line)",
    background: "var(--paper)",
    "border-radius": "var(--radius)",
    "min-width": "0px",
    position: "relative",
    padding: `${space(1.25)} ${space(1.5)}`,
    "margin-bottom": "10px",
  },
  "& .block-top": {
    display: "flex",
    "justify-content": "space-between",
    "align-items": "center",
    "font-size": "13px",
    color: "var(--muted)",
    "margin-bottom": "5px",
    gap: space(0.5),
  },
  "& .block-top > span": {
    display: "flex",
    "align-items": "center",
    gap: space(0.875),
  },
  "& .block-index": {
    color: "var(--muted)",
    "font-variant-numeric": "tabular-nums",
    "font-size": "12px",
  },
  "& .block-actions": {
    display: "flex",
    "align-items": "center",
    gap: space(0),
    "--hui-button-height": "2rem",
    "--hui-button-padding": `${space(0.5)} ${space(0.8)}`,
    "--hui-button-text-size": "0.8125rem",
  },
  "& .block-card label": {
    "font-size": "12px",
  },
  "& .block-card label:last-child": {
    "margin-bottom": "0px",
  },
  "& .block-card input, & .block-card textarea, & .block-card select": {
    "font-size": "12px",
  },
  "& .compact-field": {
    "flex-direction": "row",
    "align-items": "center",
    "justify-content": "space-between",
  },
  '& .compact-field [aria-haspopup="listbox"]': {
    "max-width": "150px",
  },
  "& .code-input": {
    "tab-size": "2",
    "font-family":
      "ui-monospace, SFMono-Regular, Consolas, monospace !important",
    background: "var(--paper) !important",
    "line-height": "1.7 !important",
    "font-size": "13px !important",
  },
  "& .image-block-preview": {
    position: "relative",
    "flex-direction": "column",
    "align-items": "center",
    "justify-content": "center",
    gap: space(1.5),
    "border-radius": "var(--radius-control)",
    "margin-bottom": "18px",
    "min-height": "130px",
    display: "block",
    background: "none",
    padding: space(0),
  },
  "& .image-block-preview img": {
    "max-height": "240px",
    "max-width": "100%",
    "object-fit": "contain",
  },
  "& .image-block-preview .button": {
    "font-size": "12px",
    padding: `${space(0.625)} ${space(1.25)}`,
    "min-height": "30px",
  },
  "& .image-block details": {
    "border-top": "1px solid var(--line)",
    "font-size": "12px",
  },
  "& .image-block .field-grid": {
    "grid-template-columns": "repeat(3, minmax(0px, 1fr))",
    gap: `${space(0)} ${space(1.25)}`,
  },
  "& .image-block label": {
    "margin-bottom": "12px",
  },
  "& .adornment-choices": {
    display: "flex",
    "flex-wrap": "wrap",
    gap: space(1),
  },
  "& .adornment-choices .check-label": {
    padding: space(0.75),
    border: "1px solid var(--line)",
    "border-radius": "var(--radius-control)",
    "font-size": "12px",
  },
  "& .adornment-choices img": {
    width: "22px",
    height: "22px",
    "object-fit": "contain",
  },
  "& .add-block": {
    "border-radius": "var(--radius)",
    margin: `${space(2.5)} ${space(0)}`,
    "border-style": "solid",
    padding: space(1.5),
    background: "none",
  },
  "& .add-block > .eyebrow": {
    display: "block",
    "margin-bottom": "14px",
    color: "var(--muted)",
  },
  "& .add-block > div": {
    display: "flex",
    "flex-wrap": "wrap",
    gap: space(1),
  },
  "& .add-block .button": {
    "font-size": "12px",
    "min-height": "30px",
  },
  "& .seo-panel": {
    padding: space(2),
    "font-size": "12px",
  },
  "& .seo-panel > summary": {
    padding: space(0),
  },
  "& .seo-panel .seo-image": {
    display: "flex",
    gap: space(1.5),
    "align-items": "center",
    "margin-bottom": "20px",
  },
  "& .seo-image img": {
    width: "70px",
    height: "48px",
    "object-fit": "cover",
  },
  "& .history-panel": {
    "max-height": "350px",
    overflow: "auto",
  },
  "& .history-panel h2": {
    "font-size": "17px",
  },
  "& .history-panel p": {
    "font-size": "12px",
  },
  "& .special-block": {
    padding: space(2.25),
    background: "var(--surface)",
    "border-radius": "var(--radius-control)",
  },
  "& .special-block p": {
    margin: `${space(0.5)} ${space(0)} ${space(0)}`,
    "font-size": "12px",
  },
  "& .navigation-category .block-top": {
    "margin-bottom": "20px",
  },
  "& .navigation-item .block-actions": {
    "margin-top": "20px",
  },
  "& .block-actions button, & .rich-toolbar button": {
    "min-height": "32px",
    "min-width": "32px",
    "font-size": "12px",
  },
  "& .block-card label, & .block-card input, & .block-card textarea, & .block-card select":
    {
      "font-size": "13px",
    },
  "& .page-heading, & .editor-heading": {
    "margin-bottom": "18px",
  },
  "& .page-title-field, & .block-card, & .add-block, & .media-inspector, & .adornment-tile, & .media-tile":
    {
      border: "0px",
    },
  "& .block-list": {
    "padding-left": "26px",
  },
  "& .block-drag": {
    position: "absolute",
    left: "-26px",
    top: "10px",
    width: "24px",
    height: "32px",
    padding: space(0),
    border: "0px",
    background: "none",
    color: "var(--muted)",
    cursor: "grab",
    "touch-action": "none",
    "font-size": "23px",
  },
  "& .block-drag:active": {
    cursor: "grabbing",
    color: "var(--accent)",
  },
  "& .block-drag:hover": {
    color: "var(--accent)",
    background: "var(--accent-soft)",
    "border-radius": "var(--radius-control)",
  },
  "& .block-card.drop-target": {
    "box-shadow": "0 -3px var(--accent)",
  },
  "& .button.chosen": {
    background: "var(--accent-soft)",
    color: "var(--accent)",
  },
  "& .image-block-preview > .button": {
    margin: `${space(1.25)} ${space(0)}`,
  },
  "& .image-block-preview .composition": {
    "max-width": "320px",
    margin: "auto",
  },
  "& .image-block-preview .composition-photo": {
    display: "block",
    width: "100%",
    height: "auto",
    "max-width": "none",
    "max-height": "none",
    margin: space(0),
  },
  "& .image-block-preview .composition-layer": {
    width: "auto",
    height: "auto",
    "max-width": "none",
    "max-height": "none",
    margin: space(0),
  },
  "& .compact-choices": {
    display: "flex",
    "flex-wrap": "wrap",
    gap: space(0.625),
    margin: `${space(1.25)} ${space(0)}`,
  },
  "& .compact-choices .button": {
    display: "inline-flex",
    "align-items": "center",
    gap: space(0.625),
    "font-size": "12px",
  },
  "& .compact-choices img": {
    width: "28px",
    height: "20px",
    "object-fit": "contain",
  },
  "& .adornment-suite .composition": {
    "max-width": "min(100%, 350px)",
    margin: "auto",
  },
  "& .composition-surround": {
    padding: space(4.5),
    background: "var(--surface)",
    "border-radius": "6px",
    overflow: "hidden",
  },
  "& .composition": {
    position: "relative",
    width: "100%",
  },
  "& .composition-photo": {
    display: "block",
    width: "100%",
    height: "auto",
    "max-height": "none",
  },
  "& .composition-placeholder": {
    "aspect-ratio": "4 / 3",
    display: "grid",
    "place-items": "center",
    background: "var(--paper)",
    color: "var(--muted)",
  },
  "& .composition-layer": {
    "max-width": "none",
    "touch-action": "none",
    "user-select": "none",
  },
  '& .composition-layer[role="button"]': {
    cursor: "grab",
  },
  "& .composition-layer.selected": {
    outline: "2px dashed var(--accent)",
    "outline-offset": "5px",
  },
  "& .placement-controls": {
    display: "grid",
    "grid-template-columns": "1fr 1fr",
    gap: `${space(1)} ${space(2.25)}`,
    "align-items": "center",
    "margin-top": "12px",
  },
  "& .placement-controls label": {
    margin: space(0),
  },
  "& .placement-controls output": {
    "font-size": "12px",
    color: "var(--muted)",
  },
  '& .placement-controls input[type="range"]': {
    width: "100%",
    padding: space(0),
    border: "0px",
    "accent-color": "var(--accent)",
  },
  "& .placement-controls small": {
    "grid-column": "1 / -1",
  },
  "& .image-appearance": {
    display: "grid",
    "grid-template-columns": "1fr 1fr",
    gap: `${space(1.25)} ${space(2)}`,
    margin: `${space(1.5)} ${space(0)}`,
  },
  "& .image-appearance label": {
    "min-width": "0px",
    margin: space(0),
  },
  '& .image-appearance input[type="range"]': {
    width: "100%",
    padding: space(0),
    border: "0px",
    "accent-color": "var(--accent)",
  },
  '& .image-appearance input[type="color"]': {
    width: "100%",
    height: "32px",
  },
  "& .image-appearance span": {
    "font-size": "12px",
  },
  "& .adornment-workbench .composition-surround": {
    padding: space(4),
  },
  "& .composition-viewport": {
    position: "relative",
    margin: "auto",
  },
  "& .composition-scene": {
    display: "flex",
    "flex-direction": "column",
    position: "absolute",
    top: "0px",
    left: "0px",
    "transform-origin": "left top",
    "line-height": "1.5",
    color: "initial",
  },
  "& .adornment-workbench .composition": {
    position: "relative",
    display: "block",
    "max-width": "100%",
    "flex-shrink": "0",
    "align-self": "flex-start",
    margin: space(0),
  },
  "& .adornment-workbench .composition-photo": {
    display: "block",
    "max-width": "100%",
    width: "auto",
    height: "auto",
    "max-height": "none",
    "object-fit": "contain",
    margin: space(0),
    "border-radius": "0px",
  },
  "& .adornment-workbench .composition-layer": {
    "max-width": "none",
    width: "auto",
    height: "auto",
    "max-height": "none",
    margin: space(0),
    "border-radius": "0px",
  },
  "& .preview-photo-settings": {
    "margin-bottom": "16px",
  },
  "@media (max-width: 800px)": {
    "& .editor-actions": {
      "flex-direction": "column",
      "align-items": "flex-end",
      gap: space(0.75),
    },
    "& .editor-heading h1": {
      "font-size": "25px",
    },
    "& .editor-toolbar": {
      gap: space(1.5),
    },
  },
  "@media (max-width: 540px)": {
    "& .block-top": {
      "align-items": "flex-start",
      "flex-flow": "column wrap",
      gap: space(0.625),
    },
    "& .block-actions": {
      "align-self": "flex-end",
    },
    "& .block-card": {
      padding: space(1),
    },
    "& .editor-toolbar > div": {
      "flex-wrap": "wrap",
    },
    "& .editor-toolbar .button.small": {
      "font-size": "12px",
    },
    "& .editor-heading .button": {
      padding: `${space(1)} ${space(1.25)}`,
      "font-size": "12px",
    },
    "& .editor-heading .save-status": {
      "font-size": "12px",
    },
    "& .image-block .field-grid": {
      "grid-template-columns": "repeat(2, minmax(0px, 1fr))",
    },
    "& .navigation-item > .block-actions": {
      "grid-column": "1 / -1",
      margin: space(0),
    },
    "& .editor-heading": {
      "align-items": "flex-start",
      "flex-wrap": "wrap",
    },
    "& .editor-heading h1": {
      "overflow-wrap": "anywhere",
    },
    "& .editor-actions": {
      "flex-shrink": "0",
      width: "100%",
    },
    "& .block-list": {
      "padding-left": "24px",
    },
    "& .composition-surround": {
      padding: space(3),
    },
    "& .placement-controls": {
      "grid-template-columns": "1fr",
    },
  },
});
