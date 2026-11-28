import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";

export const designStyles = css({
  "scroll-behavior": "smooth",
  "& .design-header": {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: space(2.5),
    "min-height": "76px",
    padding: "0 clamp(20px, 4vw, 64px)",
    "border-bottom": "1px solid var(--line)",
    background: "var(--canvas)",
  },
  "& .design-header nav": {
    display: "flex",
    "align-items": "center",
    gap: "clamp(16px, 2vw, 30px)",
    "font-size": "13px",
  },
  "& .design-header nav a:last-child": {
    color: "var(--accent)",
    "font-weight": "600",
  },
  "& .design-layout": {
    display: "grid",
    "grid-template-columns": "180px minmax(0, 1000px)",
    "justify-content": "center",
    gap: "clamp(32px, 5vw, 80px)",
    padding: "0 clamp(20px, 4vw, 64px)",
  },
  "& .design-index": {
    position: "sticky",
    top: "32px",
    "align-self": "start",
    "padding-top": "68px",
    "font-size": "13px",
  },
  "& .design-index > span": {
    display: "block",
    color: "var(--muted)",
    "font-size": "11px",
    "font-weight": "600",
    "letter-spacing": "0.08em",
    "text-transform": "uppercase",
    "margin-bottom": "14px",
  },
  "& .design-index nav": {
    display: "grid",
    gap: space(0.625),
  },
  "& .design-index a": {
    padding: `${space(0.75)} 0`,
  },
  "& .design-main": {
    "min-width": "0",
  },
  "& .design-intro": {
    padding: `${space(7.75)} 0 ${space(9)}`,
    "max-width": "650px",
  },
  "& .design-intro h1": {
    "font-size": "clamp(42px, 6vw, 72px)",
    "letter-spacing": "-0.03em",
    "line-height": "1",
    margin: `0 0 ${space(2.5)}`,
  },
  "& .design-intro > p:last-child": {
    "max-width": "570px",
    color: "var(--muted)",
    "font-size": "17px",
    "line-height": "1.55",
    margin: "0",
  },
  "& .design-section": {
    "scroll-margin-top": "30px",
    "border-top": "1px solid var(--line)",
    padding: `${space(4.75)} 0 ${space(9.5)}`,
  },
  "& .design-section-head": {
    display: "grid",
    "grid-template-columns": "minmax(0, 1fr)",
    gap: space(1.75),
    "margin-bottom": "30px",
  },
  "& .design-section-head h2": {
    "font-size": "28px",
    "letter-spacing": "-0.03em",
    margin: `0 0 ${space(0.75)}`,
  },
  "& .design-section-head p": {
    color: "var(--muted)",
    margin: "0",
    "max-width": "590px",
  },
  "& .design-colors": {
    display: "grid",
    "grid-template-columns": "repeat(4, minmax(0, 1fr))",
    gap: space(1.5),
  },
  "& .design-color": {
    border: "1px solid var(--line)",
    "border-radius": "var(--radius)",
    background: "var(--paper)",
    overflow: "hidden",
    "min-width": "0",
  },
  "& .design-color-swatch": {
    display: "block",
    height: "96px",
    "border-bottom": "1px solid var(--line)",
  },
  "& .design-color-meta": {
    display: "grid",
    gap: space(0.25),
    padding: space(1.5),
    "min-width": "0",
  },
  "& .design-color-meta strong": {
    "font-size": "12px",
  },
  "& .design-color-meta small": {
    "min-height": "34px",
    "line-height": "1.4",
  },
  "& .design-color-meta code, & .design-shape-card code": {
    color: "var(--muted)",
    "font-size": "11px",
    "overflow-wrap": "anywhere",
  },
  "& .design-type-list": {
    "border-top": "1px solid var(--line)",
  },
  "& .design-type-row": {
    display: "grid",
    "grid-template-columns": "200px minmax(0, 1fr)",
    gap: space(3),
    "align-items": "baseline",
    "border-bottom": "1px solid var(--line)",
    padding: `${space(2.75)} 0`,
  },
  "& .design-type-row > small:first-child": {
    color: "var(--muted)",
  },
  "& .design-type-row > :last-child": {
    margin: "0",
  },
  "& .design-type-row p": {
    "max-width": "540px",
  },
  "& .design-shapes": {
    display: "grid",
    "grid-template-columns": "repeat(3, minmax(0, 1fr))",
    gap: space(1.5),
  },
  "& .design-shape-card": {
    display: "flex",
    "flex-direction": "column",
    gap: space(0.625),
    border: "1px solid var(--line)",
    "border-radius": "var(--radius)",
    background: "var(--paper)",
    padding: space(2.5),
    "min-height": "185px",
  },
  "& .design-shape-card strong": {
    "margin-top": "auto",
    "font-size": "13px",
  },
  "& .design-note": {
    color: "var(--muted)",
    "font-size": "12px",
    margin: `${space(2.25)} 0 0`,
  },
  "& .design-radius-panel, & .design-radius-control": {
    width: "76px",
    height: "58px",
    background: "var(--accent-soft)",
    border: "1px solid var(--accent)",
  },
  "& .design-radius-panel": {
    "border-radius": "var(--radius)",
  },
  "& .design-radius-control": {
    "border-radius": "var(--radius-control)",
  },
  "& .design-focus-example": {
    display: "grid",
    "place-items": "center",
    width: "max-content",
    "min-width": "100px",
    height: "58px",
    padding: `0 ${space(1.5)}`,
    border: "1px solid var(--line)",
    "border-radius": "var(--radius-control)",
    "font-size": "12px",
  },
  "& .design-sample": {
    padding: space(3.25),
  },
  "& .design-button-row, & .design-badges": {
    display: "flex",
    "flex-wrap": "wrap",
    "align-items": "center",
    gap: space(1.5),
  },
  "& .design-caption": {
    color: "var(--muted)",
    "font-size": "12px",
    margin: `${space(2.5)} 0 0`,
  },
  "& .design-form-sample": {
    "max-width": "700px",
  },
  "& .design-form-sample .field-grid": {
    "align-items": "start",
  },
  "& .design-form-sample > label": {
    "margin-top": "2px",
  },
  "& .design-form-sample .check-label": {
    margin: "0",
  },
  "& .design-badges": {
    "margin-bottom": "24px",
  },
  "& .design-sample [data-tone]": {
    margin: `${space(1.5)} 0`,
  },
  "& .design-empty": {
    "margin-top": "24px",
    border: "1px dashed var(--line)",
    "border-radius": "var(--radius)",
  },
  "& .design-empty p": {
    margin: `${space(0.5)} 0 ${space(2.25)}`,
  },
  "& .design-pattern": {
    "margin-bottom": "38px",
    "min-width": "0",
  },
  "& .design-pattern-label": {
    color: "var(--muted)",
    "font-size": "12px",
    "font-weight": "600",
    "margin-bottom": "12px",
  },
  "& .design-pattern .task-row": {
    "border-top": "1px solid var(--line)",
    "max-width": "420px",
  },
  "& .design-pattern .seo-preview": {
    padding: space(2.75),
  },
  "& .design-media-fixture": {
    width: "min(100%, 240px)",
  },
  "& .design-media-fixture .media-tile": {
    display: "block",
  },
  "& .design-editor-fixture": {
    padding: space(2.5),
  },
  "& .design-editor-fixture .editor-heading h1": {
    "font-size": "22px",
    margin: `${space(0.5)} 0`,
  },
  "& .design-editor-fixture .editor-toolbar": {
    "border-top": "1px solid var(--line)",
    margin: `${space(2.5)} 0 0`,
    padding: `${space(1.75)} 0 0`,
  },
  "& .design-pattern .operator-sites": {
    padding: `0 ${space(2.75)}`,
  },
  "& .design-pattern .operator-site": {
    "border-bottom": "0",
  },
  "& .design-pattern .operator-site > div:last-child .button": {
    width: "100%",
  },
  "& .design-footer": {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: space(2.5),
    "border-top": "1px solid var(--line)",
    padding: `${space(3.5)} 0 ${space(6.875)}`,
    "font-size": "12px",
  },
  "& .design-footer .brand": {
    "font-size": "16px",
  },
  "& .design-footer .brand-mark": {
    width: "24px",
    height: "24px",
    "font-size": "20px",
  },
  "@media (max-width: 1050px)": {
    "& .design-layout": {
      "grid-template-columns": "135px minmax(0, 1fr)",
      gap: space(3.75),
    },
    "& .design-colors": {
      "grid-template-columns": "repeat(3, minmax(0, 1fr))",
    },
  },
  "@media (max-width: 720px)": {
    "& .design-header nav a:not(:last-child), & .design-index": {
      display: "none",
    },
    "& .design-layout": {
      display: "block",
    },
    "& .design-intro": {
      padding: `${space(6.5)} 0 ${space(7.25)}`,
    },
    "& .design-section": {
      padding: `${space(4)} 0 ${space(7.25)}`,
    },
    "& .design-colors": {
      "grid-template-columns": "repeat(2, minmax(0, 1fr))",
    },
    "& .design-type-row": {
      display: "block",
    },
    "& .design-type-row > small:first-child": {
      display: "block",
      "margin-bottom": "12px",
    },
    "& .design-shapes": {
      "grid-template-columns": "1fr",
    },
    "& .design-shape-card": {
      "min-height": "150px",
    },
    "& .design-sample": {
      padding: space(2.25),
    },
    "& .design-pattern .operator-sites": {
      padding: `0 ${space(2)}`,
    },
  },
  "@media (max-width: 420px)": {
    "& .design-colors": {
      gap: space(1),
    },
    "& .design-color-swatch": {
      height: "70px",
    },
    "& .design-color-meta": {
      padding: space(1.25),
    },
    "& .design-color-meta small": {
      "min-height": "47px",
    },
  },
  "@media (prefers-reduced-motion: reduce)": {
    "scroll-behavior": "auto",
  },
});
