import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";

export const adminCoreStyles = css({
  // Compatibility names for CMS-owned layout recipes; appearance comes from Clean.
  "--ink": "var(--hui-ink)",
  "--muted": "var(--hui-muted)",
  "--line": "var(--hui-border)",
  "--field-border": "var(--hui-control-border)",
  "--paper": "var(--hui-surface)",
  "--canvas": "var(--hui-canvas)",
  "--surface": "var(--hui-hover-surface)",
  "--surface-hover": "var(--hui-selected-surface)",
  "--tea": "var(--hui-accent)",
  "--on-tea": "var(--hui-on-accent)",
  "--accent": "var(--hui-accent)",
  "--accent-hover": "var(--hui-selected-ink)",
  "--accent-soft": "var(--hui-selected-surface)",
  "--on-accent": "var(--hui-on-accent)",
  "--danger": "var(--hui-danger)",
  "--danger-hover": "var(--hui-danger)",
  "--danger-soft": "var(--hui-danger-surface)",
  "--danger-soft-hover": "var(--hui-danger-surface)",
  "--radius": "var(--hui-panel-radius)",
  "--radius-control": "var(--hui-control-radius)",
  "--shadow": "#19212620",
  "--backdrop": "#19212688",
  "& *": {
    "box-sizing": "border-box",
  },
  "& body": { margin: space(0) },
  "& button, & a, & input, & textarea": {
    "-webkit-tap-highlight-color": "transparent",
  },
  "& button, & a": { "touch-action": "manipulation" },
  "& a:not([data-variant])": {
    color: "inherit",
    "text-decoration": "none",
  },
  "& a:not([data-variant]):hover": {
    "text-decoration": "underline",
    "text-underline-offset": "3px",
  },
  "& h1, & h2, & h3, & p": {
    "margin-top": "0px",
  },
  "& h1": {
    "font-weight": "550",
    "line-height": "1.15",
    "margin-bottom": "12px",
    "font-size": "clamp(26px, 2.5vw, 34px)",
    "letter-spacing": "-0.8px",
  },
  "& h2": {
    "font-size": "20px",
    "letter-spacing": "-0.5px",
    "font-weight": "550",
    "line-height": "1.35",
  },
  "& h3": {
    "font-size": "14px",
    "font-weight": "600",
  },
  "& p": {
    "margin-bottom": "16px",
  },
  "& small": {
    "font-size": "12px",
    color: "var(--muted)",
  },
  "& img": {
    "max-width": "100%",
  },
  "& label": {
    display: "flex",
    "flex-direction": "column",
    "font-weight": "550",
    "margin-bottom": "14px",
    gap: space(0.625),
  },
  "& label small": { "font-weight": "400", "line-height": "1.5" },
  "& details > summary": {
    cursor: "pointer",
    "font-weight": "550",
    "list-style": "none",
    padding: `${space(1.5)} ${space(0)}`,
  },
  "& details > summary::before": {
    content: '"+"',
    display: "inline-block",
    "margin-right": "10px",
    color: "var(--muted)",
  },
  "& details[open] > summary::before": {
    content: '"−"',
  },
  "& details[open] > summary": {
    "margin-bottom": "12px",
  },
  "& hr": {
    width: "100%",
    border: "0",
    "border-top": "1px solid var(--line)",
    margin: `${space(2.5)} ${space(0)}`,
  },
  "& .muted": {
    color: "var(--muted)",
  },
  "& .button.small": {
    "--hui-button-height": "2rem",
    "--hui-button-padding": `${space(0.6)} ${space(1.1)}`,
    "--hui-button-text-size": "0.8125rem",
  },
  "& .check-label": {
    display: "flex",
    "flex-direction": "row",
    "align-items": "center",
    gap: space(1),
    margin: space(0),
    "font-size": "12px",
    "font-weight": "400",
  },
  "& .notice": { margin: `${space(1.5)} ${space(0)} ${space(2.5)}` },
  "& .notice button": { "margin-left": "12px" },
  "& .panel": { "margin-bottom": "22px" },
  "& .section-heading": {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: space(2),
    "margin-bottom": "20px",
  },
  "& .section-heading h2, & .section-heading .eyebrow": {
    margin: space(0),
  },
  "& .section-heading > a": {
    "font-size": "12px",
    color: "var(--accent)",
  },
  "& .field-grid": {
    display: "grid",
    "grid-template-columns": "1fr 1fr",
    gap: `${space(0)} ${space(2.25)}`,
  },
  "& .form-actions": {
    display: "flex",
    gap: space(1.5),
    "margin-top": "20px",
  },
  "& .break-word": {
    "overflow-wrap": "anywhere",
  },
  "& .skip-link": {
    position: "fixed",
    top: "-100px",
    left: "20px",
    "z-index": "100",
    background: "var(--paper)",
    padding: space(1.75),
  },
  "& .skip-link:focus": {
    top: "12px",
  },
  "& .cms-sidebar": {
    width: "232px",
    position: "fixed",
    inset: "0px auto 0px 0px",
    padding: `${space(3.75)} ${space(2.5)}`,
    display: "flex",
    "flex-direction": "column",
    "z-index": "10",
    background: "var(--canvas)",
    "border-right": "0px",
  },
  "& .brand": {
    display: "flex",
    "align-items": "center",
    gap: space(1.125),
    "font-size": "20px",
    "letter-spacing": "-0.7px",
    "font-weight": "650",
    "text-decoration": "none !important",
  },
  "& .brand-mark": {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    width: "30px",
    height: "30px",
    "font-size": "24px",
    "line-height": "1",
    "letter-spacing": "0",
  },
  "& .brand small": {
    display: "block",
    "font-size": "12px",
    "letter-spacing": "0px",
    "font-weight": "400",
    "margin-top": "2px",
  },
  "& .cms-sidebar nav": {
    display: "flex",
    "flex-direction": "column",
    gap: space(0.625),
    "margin-top": "32px",
  },
  "& .cms-sidebar nav > a": {
    padding: `${space(1.25)} ${space(1.5)}`,
    "border-radius": "var(--radius-control)",
    display: "flex",
    "align-items": "center",
    gap: space(1.5),
    color: "var(--ink)",
    "font-weight": "450",
    "white-space": "nowrap",
    "font-size": "14px",
  },
  "& .cms-sidebar nav > a:hover": {
    background: "var(--surface)",
    "text-decoration": "none",
  },
  '& .cms-sidebar nav > a[aria-current="page"]': {
    color: "var(--accent)",
    background: "var(--accent-soft)",
    "font-weight": "600",
    "box-shadow": "none",
  },
  "& .sidebar-footer": {
    "margin-top": "auto",
    padding: `${space(4)} ${space(1.5)} ${space(0)}`,
    display: "flex",
    "flex-direction": "column",
    gap: space(2.25),
  },
  "& .sidebar-footer > a": {
    display: "flex",
    "justify-content": "space-between",
    "font-size": "12px",
    color: "var(--ink)",
  },
  "& .sidebar-footer .text-button": {
    "font-size": "12px",
    "text-decoration": "none",
    color: "var(--muted)",
  },
  "& .cms-main": {
    "margin-left": "232px",
    "min-height": "100dvh",
    display: "flex",
    "flex-direction": "column",
  },
  "& .workspace-bar": {
    display: "flex",
    "align-items": "center",
    padding: `${space(0)} ${space(5.5)}`,
    "letter-spacing": "0.1px",
    background: "var(--canvas)",
    height: "56px",
    "min-height": "56px",
    "font-size": "13px",
    border: "0px",
    gap: space(2),
    "justify-content": "flex-start",
  },
  "& .workspace-bar .muted": {
    "margin-left": "10px",
  },
  "& .workspace-status": {
    color: "var(--muted)",
    display: "flex",
    "align-items": "center",
    gap: space(0.875),
    "font-size": "12px",
  },
  "& .workspace": {
    padding: space(5.5),
    "max-width": "1400px",
    width: "100%",
    margin: `${space(0)} auto`,
    flex: "1 1 0%",
  },
  "& .page-heading": {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: space(3.5),
    "margin-bottom": "24px",
  },
  "& .page-heading p:last-child": {
    margin: space(0),
  },
  "& .count": {
    display: "inline-block",
    "font-size": "12px",
    background: "var(--surface)",
    color: "var(--muted)",
    padding: `${space(0.5)} ${space(1.125)}`,
    "border-radius": "var(--radius-control)",
    "letter-spacing": "0px",
    "vertical-align": "middle",
    "margin-left": "12px",
    "font-weight": "500",
  },
  "& .overview-feature": {
    display: "grid",
    "border-radius": "var(--radius)",
    overflow: "hidden",
    "grid-template-columns": "1fr 210px",
    background: "var(--paper)",
    border: "0px",
    padding: space(3),
    gap: space(3),
    "margin-bottom": "32px",
  },
  "& .overview-feature > div": {
    display: "flex",
    "flex-direction": "column",
    "align-items": "flex-start",
    "justify-content": "center",
  },
  "& .overview-feature h2": {
    "letter-spacing": "-0.8px",
    "max-width": "300px",
    "font-size": "23px",
    margin: `${space(0)} ${space(0)} ${space(2)}`,
  },
  "& .overview-feature p": {
    "font-size": "13px",
    color: "var(--muted)",
    "max-width": "320px",
  },
  "& .overview-feature > img": {
    width: "100%",
    "object-fit": "cover",
    "border-radius": "var(--radius-control)",
    height: "190px",
    transform: "none",
  },
  "& .inventory": {
    display: "flex",
    gap: space(2.75),
    "border-top": "1px solid var(--line)",
    width: "100%",
    color: "var(--muted)",
    "margin-top": "24px",
    "padding-top": "14px",
    "font-size": "12px",
    "flex-wrap": "wrap",
  },
  "& .inventory strong": {
    "font-size": "20px",
    display: "block",
    "line-height": "1.4",
    "font-weight": "500",
    color: "var(--tea)",
  },
  "& .overview-columns": {
    display: "grid",
    "grid-template-columns": "1.1fr 1fr",
    gap: space(5.5),
  },
  "& .simple-row": {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    padding: `${space(1.875)} ${space(0)}`,
    "border-bottom": "1px solid var(--line)",
    "font-size": "13px",
  },
  "& .simple-row small": {
    display: "block",
    "font-size": "12px",
  },
  "& .simple-row > span:last-child": {
    color: "var(--muted)",
  },
  "& .task-row": {
    display: "block",
    padding: `${space(2.25)} ${space(0)}`,
    "border-bottom": "1px solid var(--line)",
    "font-size": "12px",
  },
  "& .task-row strong": {
    "font-size": "13px",
    "font-weight": "550",
  },
  "& .task-row p": {
    color: "var(--muted)",
    margin: `${space(0.75)} ${space(0)} ${space(0)}`,
  },
  "& .search-bar": {
    display: "flex",
    gap: space(1.5),
    "margin-bottom": "24px",
    "max-width": "530px",
  },
  "& .page-list": {
    "border-top": "1px solid var(--line)",
  },
  "& .list-heading, & .page-row": {
    display: "grid",
    "grid-template-columns": "minmax(220px, 1fr) 90px 150px 18px",
    gap: space(3),
    "align-items": "center",
  },
  "& .list-heading": {
    "font-size": "12px",
    color: "var(--muted)",
    "letter-spacing": "1px",
    padding: `${space(1.75)} ${space(2.25)}`,
  },
  "& .page-row": {
    "border-top": "1px solid var(--line)",
    padding: `${space(1.875)} ${space(2.25)}`,
    "font-size": "12px",
    transition: "background 0.15s",
  },
  "& .page-row:hover": {
    background: "var(--paper)",
    "text-decoration": "none",
  },
  "& .page-identity": {
    display: "flex",
    gap: space(2),
    "align-items": "center",
    "min-width": "0px",
  },
  "& .page-identity img, & .page-monogram": {
    width: "48px",
    height: "48px",
    "border-radius": "var(--radius-control)",
    "object-fit": "cover",
    "flex-shrink": "0",
    background: "var(--surface)",
  },
  "& .page-monogram": {
    display: "grid",
    "place-items": "center",
    "font-size": "22px",
    "font-weight": "400",
    color: "var(--muted)",
  },
  "& .page-identity strong": {
    "font-size": "13px",
    "font-weight": "550",
    display: "block",
  },
  "& .page-identity small": {
    "font-size": "12px",
    display: "block",
    color: "var(--muted)",
  },
  "& .row-arrow": {
    color: "var(--muted)",
  },
  "& .new-page": {
    "margin-top": "30px",
  },
  "& .new-page form": {
    "padding-top": "10px",
  },
  "& .empty-state": {
    padding: `${space(6.25)} ${space(2.5)}`,
    "text-align": "center",
    color: "var(--muted)",
  },
  "& .wide .workspace": {
    padding: `${space(3.75)} ${space(3)}`,
    "max-width": "none",
  },
  "& .login-layout": {
    "min-height": "100dvh",
    display: "flex",
    "flex-direction": "column",
    "justify-content": "center",
    width: "min(100%, 420px)",
    margin: "auto",
    padding: `${space(4)} ${space(3)}`,
  },
  "& .login-intro": {
    padding: `${space(0)} ${space(0)} ${space(3)}`,
  },
  "& .login-intro > p": {
    margin: `${space(1.5)} ${space(0)} ${space(0)}`,
    color: "var(--muted)",
  },
  "& .login-panel": {
    padding: "0",
    background: "transparent",
  },
  "& .login-panel form": {
    width: "100%",
  },
  "& .login-panel h1": {
    "font-size": "26px",
    "margin-bottom": "24px",
  },
  "& .login-panel .button": {
    width: "100%",
    margin: `${space(0.5)} ${space(0)} ${space(2.5)}`,
  },
  "& .login-panel form > a": {
    "font-size": "13px",
    color: "var(--muted)",
  },
  "& .workspace-status[hidden], & .workspace-status:not([role])": {
    display: "none",
  },
  "& .workspace, & .wide .workspace": {
    "padding-top": "20px",
  },
  "& .cms-sidebar[hidden]": {
    display: "none",
  },
  "& .cms-navigation-collapsed .cms-main": {
    "margin-left": "0px",
  },
  "& .workspace-bar > .workspace-status": {
    "margin-left": "auto",
  },
  "@media (max-width: 1200px)": {
    "& .cms-sidebar": {
      width: "200px",
      padding: `${space(3.125)} ${space(1.75)}`,
    },
    "& .cms-main": {
      "margin-left": "200px",
    },
    "& .workspace": {
      padding: space(3.75),
    },
    "& .workspace-bar": {
      padding: `${space(0)} ${space(3.75)}`,
    },
    "& .overview-feature": {
      gap: space(2.5),
      padding: space(3),
    },
    "& .overview-feature > img": {
      height: "260px",
    },
    "& .list-heading, & .page-row": {
      gap: space(1.75),
      "grid-template-columns": "minmax(180px, 1fr) 70px 135px 10px",
    },
  },
  "@media (max-width: 800px)": {
    "& .cms-sidebar": {
      position: "relative",
      width: "100%",
      "border-right": "0px",
      "border-bottom": "1px solid var(--line)",
      padding: `${space(2)} ${space(2.5)}`,
    },
    "& .brand": {
      "font-size": "19px",
    },
    "& .brand-mark": {
      width: "28px",
      height: "28px",
      "font-size": "23px",
    },
    "& .cms-sidebar nav": {
      "flex-direction": "row",
      "overflow-x": "auto",
      gap: space(0.5),
      "margin-top": "16px",
    },
    "& .cms-sidebar nav > a": {
      padding: `${space(1)} ${space(1.5)}`,
      "font-size": "13px",
    },
    "& .cms-main": {
      margin: space(0),
    },
    "& .workspace-bar": {
      height: "48px",
      "min-height": "48px",
      padding: `${space(0)} ${space(2.5)}`,
    },
    "& .workspace-status": {
      display: "none",
    },
    "& .workspace, & .wide .workspace": {
      padding: `${space(3.25)} ${space(2.5)}`,
    },
    "& .page-heading": {
      "align-items": "flex-start",
      "margin-bottom": "28px",
    },
    "& .page-heading p.muted": {
      "font-size": "12px",
    },
    "& .page-heading > .button": {
      "font-size": "12px",
      padding: `${space(1)} ${space(1.375)}`,
    },
    "& .overview-feature > img": {
      height: "180px",
    },
    "& .overview-feature h2": {
      "font-size": "24px",
    },
    "& .overview-columns": {
      gap: space(3.5),
    },
    "& .list-heading, & .page-row": {
      "grid-template-columns": "minmax(160px, 1fr) 60px 100px",
      gap: space(1.5),
      padding: `${space(1.5)} ${space(0.75)}`,
    },
    "& .row-arrow": {
      display: "none",
    },
    "& .badge": {
      "font-size": "12px",
    },
    "& .page-identity": {
      gap: space(1.25),
    },
    "& .page-identity img, & .page-monogram": {
      width: "38px",
      height: "38px",
    },
    "& .page-identity strong": {
      "font-size": "12px",
    },
    "& .overview-feature": {
      "grid-template-columns": "1fr 160px",
    },
    "& .sidebar-footer": {
      display: "flex",
      "flex-direction": "row",
      "margin-top": "12px",
      padding: `${space(1)} ${space(0)} ${space(0)}`,
      "justify-content": "space-between",
    },
  },
  "@media (max-width: 540px)": {
    "& h1": {
      "font-size": "28px",
      "letter-spacing": "-1px",
    },
    "& .page-heading": {
      gap: space(1.5),
      "flex-wrap": "wrap",
    },
    "& .overview-feature": {
      padding: space(2.75),
      "grid-template-columns": "1fr",
    },
    "& .overview-feature > img": {
      height: "180px",
      "object-position": "center 40%",
    },
    "& .overview-feature h2": {
      "max-width": "none",
    },
    "& .overview-columns": {
      "grid-template-columns": "1fr",
    },
    "& .list-heading, & .page-row": {
      "grid-template-columns": "minmax(0px, 1fr) 105px",
    },
    "& .list-heading > span:nth-child(2), & .page-row > .muted": {
      display: "none",
    },
    "& .page-identity strong": {
      "font-size": "12px",
    },
    "& .field-grid": {
      "grid-template-columns": "1fr",
    },
    "& .panel": {
      padding: space(2.25),
    },
    "& .inventory": {
      gap: space(2.25),
    },
    "& .wide .workspace": {
      "padding-left": "16px",
      "padding-right": "16px",
    },
    "& .workspace-bar": {
      padding: `${space(1.25)} ${space(2)}`,
      gap: space(1.25),
      height: "auto",
    },
  },
  "@media (prefers-reduced-motion: reduce)": {
    "& *": {
      transition: "none !important",
      "scroll-behavior": "auto !important",
    },
  },
});
