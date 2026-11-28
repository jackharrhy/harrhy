import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";

export const adminLibraryStyles = css({
  "& .media-dialog .picker-grid": {
    "margin-top": "20px",
    "max-height": "52dvh",
    overflow: "auto",
  },
  "& .picker-grid": {
    display: "grid",
    "grid-template-columns": "repeat(4, minmax(0px, 1fr))",
    gap: space(1.5),
  },
  "& .picker-image": {
    display: "flex",
    "flex-direction": "column",
    "text-align": "left",
    border: "1px solid var(--line)",
    "border-radius": "var(--radius-control)",
    padding: space(1),
    background: "var(--paper)",
    "min-width": "0px",
  },
  "& .picker-image img": {
    height: "130px",
    width: "100%",
    "object-fit": "contain",
  },
  "& .picker-image span": {
    "font-size": "12px",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
    width: "100%",
    "margin-top": "8px",
  },
  "& .picker-image:hover": {
    "border-color": "var(--accent)",
  },
  "& .media-dialog > p": {
    "font-size": "12px",
    margin: `${space(2.25)} ${space(0)} ${space(0)}`,
  },
  "& .upload-button": {
    position: "relative",
    margin: space(0),
    overflow: "hidden",
  },
  "& .upload-button input": {
    position: "absolute",
    inset: "0px",
    opacity: "0",
    cursor: "pointer",
  },
  "& .media-tools": {
    display: "flex",
    gap: space(2),
    "margin-bottom": "26px",
  },
  "& .media-tools input": {
    "max-width": "460px",
  },
  "& .media-tools [aria-haspopup=listbox]": {
    "max-width": "210px",
  },
  "& .media-workspace": {
    display: "grid",
    "grid-template-columns": "minmax(0px, 1fr) 280px",
    gap: space(3.5),
    "align-items": "start",
  },
  "& .media-grid": {
    display: "grid",
    "grid-template-columns": "repeat(3, minmax(0px, 1fr))",
    gap: space(2),
    "min-height": "300px",
  },
  "& .media-tile": {
    "text-align": "left",
    padding: space(0),
    background: "var(--paper)",
    border: "1px solid var(--line)",
    "border-radius": "var(--radius)",
    overflow: "hidden",
    "min-width": "0px",
    transition: "box-shadow 0.15s",
  },
  "& .media-tile:hover:not(:disabled)": {
    "box-shadow": "inset 0 0 0 1px var(--accent)",
  },
  "& .media-tile.selected": {
    "border-color": "var(--accent)",
    "box-shadow": "0 0 0 1px var(--accent)",
  },
  "& .media-tile > img, & .file-preview": {
    height: "180px",
    "object-fit": "contain",
    width: "100%",
    background:
      "repeating-conic-gradient(\n      var(--surface) 0% 25%,\n      var(--paper) 0% 50%\n    )\n    50%/16px 16px",
    padding: space(1.5),
  },
  "& .media-tile > span": {
    display: "block",
    padding: space(1.5),
  },
  "& .media-tile strong": {
    display: "block",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
    "font-size": "12px",
    "font-weight": "500",
  },
  "& .media-tile small": {
    display: "block",
    "font-size": "12px",
    "margin-top": "4px",
  },
  "& .file-preview": {
    display: "grid",
    "place-items": "center",
    color: "var(--muted)",
    "font-size": "25px",
    "letter-spacing": "1px",
  },
  "& .media-inspector": {
    position: "sticky",
    top: "24px",
    display: "flex",
    "flex-direction": "column",
    gap: space(2),
    border: "1px solid var(--line)",
    "border-radius": "var(--radius)",
    "font-size": "12px",
    padding: space(2),
    background: "var(--paper)",
  },
  "& .media-inspector .section-heading, & .media-inspector label, & .media-inspector p":
    {
      margin: space(0),
    },
  "& .media-inspector h2": {
    "font-size": "17px",
  },
  "& .media-inspector h3": {
    margin: `${space(1.25)} ${space(0)} ${space(-1)}`,
  },
  "& .media-inspector > a": {
    "font-size": "12px",
    color: "var(--accent)",
  },
  "& .inspector-image": {
    "max-height": "220px",
    "object-fit": "contain",
    background: "var(--surface)",
    "border-radius": "var(--radius-control)",
  },
  "& .inspector-empty": {
    padding: `${space(2)} ${space(0)}`,
  },
  "& .inspector-empty h2": {
    "font-size": "22px",
    margin: `${space(2.5)} ${space(0)} ${space(1.5)}`,
  },
  "& .inspector-empty p": {
    "margin-bottom": "16px",
  },
  "& .settings-columns": {
    display: "grid",
    "grid-template-columns": "minmax(0px, 1fr) 260px",
    gap: space(4.5),
    "align-items": "start",
  },
  "& .help-panel": {
    "border-left": "1px solid var(--line)",
    "padding-left": "28px",
    "margin-top": "16px",
    "font-size": "12px",
    color: "var(--muted)",
    position: "sticky",
    top: "30px",
  },
  "& .help-panel h2": {
    color: "var(--ink)",
    "max-width": "200px",
    "font-size": "18px",
  },
  "& .help-panel a": {
    color: "var(--accent)",
    "font-size": "12px",
  },
  "& .navigation-portrait": {
    width: "120px",
    height: "120px",
    "object-fit": "contain",
  },
  "& .navigation-item": {
    display: "grid",
    "grid-template-columns": "1fr 1fr auto",
    gap: space(1.25),
    "align-items": "center",
    "margin-bottom": "10px",
  },
  "& .navigation-item label": {
    "font-size": "12px",
    margin: space(0),
  },
  "& .navigation-item input, & .navigation-item [aria-haspopup=listbox]": {
    "font-size": "12px",
  },
  "& .category-art": {
    display: "flex",
    gap: space(1.5),
    "align-items": "center",
    margin: `${space(0)} ${space(0)} ${space(2.5)}`,
  },
  "& .category-art img": {
    width: "70px",
    height: "32px",
    "object-fit": "contain",
  },
  "& .category-art button": {
    "font-size": "12px",
  },
  "& .settings-columns > section > .button": {
    "margin-bottom": "24px",
  },
  "& .adornment-grid": {
    display: "grid",
    "grid-template-columns": "repeat(4, minmax(0px, 1fr))",
    gap: space(2.25),
  },
  "& .adornment-tile": {
    border: "1px solid var(--line)",
    "border-radius": "var(--radius)",
    background: "var(--paper)",
    overflow: "hidden",
    padding: space(0),
    "text-align": "left",
  },
  "& .adornment-tile > div": {
    height: "150px",
    background: "var(--surface)",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    padding: space(3.5),
  },
  "& .adornment-tile img": {
    "max-height": "100px",
    "object-fit": "contain",
  },
  "& .adornment-tile strong": {
    "font-weight": "550",
    "font-size": "12px",
    display: "block",
    padding: `${space(1.75)} ${space(2)}`,
  },
  "& .adornment-tile:hover:not(:disabled)": {
    "box-shadow": "inset 0 0 0 1px var(--accent)",
  },
  "& .color-field": {
    display: "flex",
    gap: space(1.5),
  },
  '& .color-field input[type="color"]': {
    height: "44px",
    width: "60px",
    border: "1px solid var(--line)",
    background: "var(--paper)",
    padding: space(0.5),
    "border-radius": "var(--radius-control)",
  },
  "& .color-preview": {
    height: "150px",
    border: "1px solid var(--line)",
    "border-radius": "var(--radius-control)",
    display: "grid",
    "place-items": "center",
    "margin-bottom": "32px",
    color: "var(--ink)",
  },
  "& .seo-list": {
    display: "grid",
    gap: space(1.5),
  },
  "& .seo-row": {
    padding: space(2.5),
    background: "var(--surface)",
    "border-radius": "8px",
    "min-width": "0",
  },
  "& .seo-row-heading": {
    display: "flex",
    "align-items": "center",
    "flex-wrap": "wrap",
    gap: space(1.25),
    "margin-bottom": "16px",
  },
  "& .seo-row-heading h2": {
    "font-size": "15px",
    margin: "0",
  },
  "& .seo-row-heading a": {
    "margin-left": "auto",
    "font-size": "12px",
  },
  "& .seo-preview": {
    display: "grid",
    "grid-template-columns": "minmax(0, 1fr)",
    gap: space(2.5),
  },
  "& .seo-preview:has(.seo-thumbnail)": {
    "grid-template-columns": "minmax(0, 1fr) 112px",
  },
  "& .seo-preview h3": {
    "font-size": "19px",
    color: "var(--accent)",
    margin: `${space(0.75)} 0`,
    "overflow-wrap": "anywhere",
  },
  "& .seo-preview p": {
    "font-size": "12px",
    color: "var(--muted)",
    "max-width": "560px",
    margin: "0",
    "overflow-wrap": "anywhere",
  },
  "& .search-url": {
    "font-size": "12px",
    color: "var(--muted)",
    "overflow-wrap": "anywhere",
  },
  "& .seo-thumbnail": {
    width: "112px",
    height: "84px",
    "object-fit": "contain",
    "border-radius": "4px",
    background: "var(--paper)",
  },
  "& .seo-checks": {
    display: "flex",
    "flex-wrap": "wrap",
    gap: `${space(0.75)} ${space(2.25)}`,
    padding: "0",
    margin: `${space(1.5)} 0 0`,
    "list-style": "none",
    "font-size": "12px",
  },
  "& .seo-preview .seo-note": {
    "margin-top": "8px",
  },
  "& .seo-defaults": {
    display: "flex",
    "justify-content": "space-between",
    "align-items": "start",
    gap: space(2.5),
    "margin-bottom": "24px",
    "font-size": "13px",
  },
  "& .seo-defaults p": {
    margin: `${space(0.75)} 0`,
    "overflow-wrap": "anywhere",
  },
  "& .seo-defaults small": {
    color: "var(--muted)",
  },
  "& .seo-defaults a": {
    "flex-shrink": "0",
  },
  "& .seo-filters": {
    display: "flex",
    "flex-wrap": "wrap",
    gap: space(1),
  },
  "& .seo-filters a": {
    padding: `${space(1)} ${space(1.25)}`,
    "border-radius": "4px",
    "font-size": "12px",
  },
  '& .seo-filters a[aria-current="page"]': {
    background: "var(--accent-soft)",
    color: "var(--accent)",
  },
  "& .seo-filters span": {
    "margin-left": "5px",
    "font-variant-numeric": "tabular-nums",
  },
  "& .seo-help": {
    "font-size": "12px",
    margin: `${space(1.75)} 0`,
  },
  "& .seo-draft": {
    "margin-top": "16px",
  },
  "& .seo-draft summary": {
    "font-size": "12px",
    cursor: "pointer",
  },
  "& .seo-footer": {
    display: "flex",
    "flex-wrap": "wrap",
    gap: space(2),
    "margin-top": "24px",
    "font-size": "12px",
    color: "var(--muted)",
  },
  "& .upload-button:focus-within": {
    outline: "3px solid var(--accent)",
    "outline-offset": "3px",
  },
  "& .color-preview > span": {
    background: "var(--paper)",
    color: "var(--ink)",
    padding: `${space(0.5)} ${space(1)}`,
    "border-radius": "var(--radius-control)",
  },
  "& .adornment-suite": {
    width: "min(1100px, -32px + 100vw)",
    "max-height": "calc(100dvh - 32px)",
    padding: space(3),
  },
  "& .suite-layout": {
    display: "grid",
    "grid-template-columns": "minmax(0px, 1.8fr) minmax(220px, 1fr)",
    gap: space(3),
    "align-items": "start",
  },
  "& .suite-layout .field-grid": {
    "grid-template-columns": "1fr",
  },
  "& .adornment-suite > .form-actions": {
    position: "sticky",
    bottom: "-24px",
    background: "var(--paper)",
    padding: `${space(1.5)} ${space(0)}`,
    "margin-bottom": "0px",
  },
  "& .advanced-placement": {
    margin: `${space(2)} ${space(0)}`,
  },
  "& .advanced-placement .field-grid": {
    "grid-template-columns": "1fr 1fr",
  },
  "& .media-workspace.with-folders": {
    "grid-template-columns": "175px minmax(0px, 1fr) 260px",
    gap: space(2.5),
  },
  "& .media-content": {
    "min-width": "0px",
  },
  "& .media-content .media-grid": {
    "grid-template-columns": "repeat(3, minmax(0px, 1fr))",
  },
  "& .folder-nav": {
    "min-width": "0px",
  },
  "& .folder-nav h2": {
    "font-size": "14px",
    "margin-bottom": "10px",
  },
  "& .folder-nav h3": {
    margin: `${space(2)} ${space(0)} ${space(1)}`,
  },
  "& .folder-nav .section-heading": {
    gap: space(0.5),
    "flex-wrap": "wrap",
    "margin-bottom": "4px",
  },
  "& .folder-nav .text-button": {
    "font-size": "12px",
  },
  "& .folder-link": {
    display: "block",
    "text-align": "left",
    width: "100%",
    border: "0px",
    background: "none",
    color: "var(--muted)",
    "border-radius": "4px",
    padding: `${space(0.875)} ${space(1.25)}`,
    "overflow-wrap": "anywhere",
  },
  "& .folder-link:hover, & .folder-link.active": {
    color: "var(--accent)",
    background: "var(--accent-soft)",
  },
  "& .folder-link.active": {
    "font-weight": "600",
  },
  "& .folder-heading h2": {
    "font-size": "16px",
  },
  "& .folder-heading p:empty": {
    display: "none",
  },
  "& .folder-children": {
    display: "flex",
    "flex-wrap": "wrap",
    gap: space(0.75),
    "margin-bottom": "12px",
  },
  "& .navigation-toggle": {
    "flex-shrink": "0",
  },
  "@media (min-width: 1600px)": {
    "& .media-grid": {
      "grid-template-columns": "repeat(4, minmax(0px, 1fr))",
    },
  },
  "@media (max-width: 1200px)": {
    "& .media-grid": {
      "grid-template-columns": "repeat(2, minmax(0px, 1fr))",
    },
    "& .settings-columns": {
      "grid-template-columns": "minmax(0px, 1fr)",
    },
    "& .help-panel": {
      position: "static",
      "max-width": "500px",
    },
    "& .adornment-grid": {
      "grid-template-columns": "repeat(3, minmax(0px, 1fr))",
    },
    "& .media-workspace.with-folders": {
      "grid-template-columns": "150px minmax(0px, 1fr)",
    },
    "& .media-inspector": {
      "grid-column": "2",
    },
    "& .media-content .media-grid": {
      "grid-template-columns": "repeat(3, minmax(0px, 1fr))",
    },
  },
  "@media (max-width: 800px)": {
    "& .media-workspace": {
      "grid-template-columns": "minmax(0px, 1fr)",
    },
    "& .media-grid": {
      "grid-template-columns": "repeat(3, minmax(0px, 1fr))",
    },
    "& .media-inspector": {
      position: "relative",
      top: "0px",
      "grid-column": "auto",
    },
    "& .picker-grid": {
      "grid-template-columns": "repeat(3, minmax(0px, 1fr))",
    },
    "& .suite-layout": {
      "grid-template-columns": "1fr",
    },
    "& .adornment-suite": {
      padding: space(2),
    },
    "& .media-workspace.with-folders": {
      "grid-template-columns": "1fr",
    },
    "& .folder-nav": {
      display: "flex",
      "flex-wrap": "wrap",
      "align-items": "center",
      gap: space(0.5),
    },
    "& .folder-nav > h2": {
      display: "none",
    },
    "& .folder-nav > .folder-link": {
      width: "auto",
    },
    "& .folder-nav > div": {
      width: "100%",
    },
    "& .folder-nav > .section-heading": {
      width: "auto",
    },
    "& .folder-nav h3": {
      margin: space(0),
    },
  },
  "@media (max-width: 540px)": {
    "& .media-tools": {
      "flex-direction": "column",
      gap: space(1.25),
    },
    "& .media-tools [aria-haspopup=listbox]": {
      "max-width": "100%",
    },
    "& .media-grid": {
      "grid-template-columns": "repeat(2, minmax(0px, 1fr))",
      gap: space(1.5),
    },
    "& .media-tile > img, & .file-preview": {
      height: "150px",
    },
    "& .adornment-grid": {
      "grid-template-columns": "repeat(2, minmax(0px, 1fr))",
      gap: space(1.5),
    },
    "& .adornment-tile > div": {
      height: "120px",
    },
    "& .navigation-item": {
      "grid-template-columns": "1fr 1fr",
    },
    "& .seo-preview:has(.seo-thumbnail)": {
      "grid-template-columns": "1fr",
      gap: space(1.5),
    },
    "& .seo-defaults": {
      "flex-direction": "column",
      gap: space(1.25),
    },
    "& .seo-row-heading a": {
      "flex-basis": "100%",
      "margin-left": "0",
    },
    "& .picker-grid": {
      "grid-template-columns": "repeat(2, minmax(0px, 1fr))",
    },
    "& .picker-image img": {
      height: "110px",
    },
    "& .media-content .media-grid": {
      "grid-template-columns": "repeat(2, minmax(0px, 1fr))",
    },
  },
});
