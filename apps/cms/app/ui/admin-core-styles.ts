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
  "& body": { margin: "0px" },
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
    gap: "5px",
  },
  "& label small": { "font-weight": "400", "line-height": "1.5" },
  "& details > summary": {
    cursor: "pointer",
    "font-weight": "550",
    "list-style": "none",
    padding: "12px 0px",
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
    margin: "20px 0px",
  },
  "& .muted": {
    color: "var(--muted)",
  },
  "& .button.small": {
    "--hui-button-height": "2rem",
    "--hui-button-padding": "0.3rem 0.55rem",
    "--hui-button-text-size": "0.8125rem",
  },
  "& .check-label": {
    display: "flex",
    "flex-direction": "row",
    "align-items": "center",
    gap: "8px",
    margin: "0px",
    "font-size": "12px",
    "font-weight": "400",
  },
  "& .notice": { margin: "12px 0px 20px" },
  "& .notice button": { "margin-left": "12px" },
  "& .panel": { "margin-bottom": "22px" },
  "& .section-heading": {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: "16px",
    "margin-bottom": "20px",
  },
  "& .section-heading h2, & .section-heading .eyebrow": {
    margin: "0px",
  },
  "& .section-heading > a": {
    "font-size": "12px",
    color: "var(--accent)",
  },
  "& .field-grid": {
    display: "grid",
    "grid-template-columns": "1fr 1fr",
    gap: "0px 18px",
  },
  "& .form-actions": {
    display: "flex",
    gap: "12px",
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
    padding: "14px",
  },
  "& .skip-link:focus": {
    top: "12px",
  },
  "& .cms-sidebar": {
    width: "232px",
    position: "fixed",
    inset: "0px auto 0px 0px",
    padding: "30px 20px",
    display: "flex",
    "flex-direction": "column",
    "z-index": "10",
    background: "var(--canvas)",
    "border-right": "0px",
  },
  "& .brand": {
    display: "flex",
    "align-items": "center",
    gap: "9px",
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
    gap: "5px",
    "margin-top": "32px",
  },
  "& .cms-sidebar nav > a": {
    padding: "10px 12px",
    "border-radius": "var(--radius-control)",
    display: "flex",
    "align-items": "center",
    gap: "12px",
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
    padding: "32px 12px 0px",
    display: "flex",
    "flex-direction": "column",
    gap: "18px",
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
    padding: "0px 44px",
    "letter-spacing": "0.1px",
    background: "var(--canvas)",
    height: "56px",
    "min-height": "56px",
    "font-size": "13px",
    border: "0px",
    gap: "16px",
    "justify-content": "flex-start",
  },
  "& .workspace-bar .muted": {
    "margin-left": "10px",
  },
  "& .workspace-status": {
    color: "var(--muted)",
    display: "flex",
    "align-items": "center",
    gap: "7px",
    "font-size": "12px",
  },
  "& .workspace": {
    padding: "44px",
    "max-width": "1400px",
    width: "100%",
    margin: "0px auto",
    flex: "1 1 0%",
  },
  "& .page-heading": {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: "28px",
    "margin-bottom": "24px",
  },
  "& .page-heading p:last-child": {
    margin: "0px",
  },
  "& .count": {
    display: "inline-block",
    "font-size": "12px",
    background: "var(--surface)",
    color: "var(--muted)",
    padding: "4px 9px",
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
    padding: "24px",
    gap: "24px",
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
    margin: "0px 0px 16px",
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
    gap: "22px",
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
    gap: "44px",
  },
  "& .simple-row": {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    padding: "15px 0px",
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
    padding: "18px 0px",
    "border-bottom": "1px solid var(--line)",
    "font-size": "12px",
  },
  "& .task-row strong": {
    "font-size": "13px",
    "font-weight": "550",
  },
  "& .task-row p": {
    color: "var(--muted)",
    margin: "6px 0px 0px",
  },
  "& .search-bar": {
    display: "flex",
    gap: "12px",
    "margin-bottom": "24px",
    "max-width": "530px",
  },
  "& .page-list": {
    "border-top": "1px solid var(--line)",
  },
  "& .list-heading, & .page-row": {
    display: "grid",
    "grid-template-columns": "minmax(220px, 1fr) 90px 150px 18px",
    gap: "24px",
    "align-items": "center",
  },
  "& .list-heading": {
    "font-size": "12px",
    color: "var(--muted)",
    "letter-spacing": "1px",
    padding: "14px 18px",
  },
  "& .page-row": {
    "border-top": "1px solid var(--line)",
    padding: "15px 18px",
    "font-size": "12px",
    transition: "background 0.15s",
  },
  "& .page-row:hover": {
    background: "var(--paper)",
    "text-decoration": "none",
  },
  "& .page-identity": {
    display: "flex",
    gap: "16px",
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
    padding: "50px 20px",
    "text-align": "center",
    color: "var(--muted)",
  },
  "& .wide .workspace": {
    padding: "30px 24px",
    "max-width": "none",
  },
  "& .login-layout": {
    "min-height": "100dvh",
    display: "flex",
    "flex-direction": "column",
    "justify-content": "center",
    width: "min(100%, 420px)",
    margin: "auto",
    padding: "32px 24px",
  },
  "& .login-intro": {
    padding: "0px 0px 24px",
  },
  "& .login-intro > p": {
    margin: "12px 0px 0px",
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
    margin: "4px 0px 20px",
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
      padding: "25px 14px",
    },
    "& .cms-main": {
      "margin-left": "200px",
    },
    "& .workspace": {
      padding: "30px",
    },
    "& .workspace-bar": {
      padding: "0px 30px",
    },
    "& .overview-feature": {
      gap: "20px",
      padding: "24px",
    },
    "& .overview-feature > img": {
      height: "260px",
    },
    "& .list-heading, & .page-row": {
      gap: "14px",
      "grid-template-columns": "minmax(180px, 1fr) 70px 135px 10px",
    },
  },
  "@media (max-width: 800px)": {
    "& .cms-sidebar": {
      position: "relative",
      width: "100%",
      "border-right": "0px",
      "border-bottom": "1px solid var(--line)",
      padding: "16px 20px",
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
      gap: "4px",
      "margin-top": "16px",
    },
    "& .cms-sidebar nav > a": {
      padding: "8px 12px",
      "font-size": "13px",
    },
    "& .cms-main": {
      margin: "0px",
    },
    "& .workspace-bar": {
      height: "48px",
      "min-height": "48px",
      padding: "0px 20px",
    },
    "& .workspace-status": {
      display: "none",
    },
    "& .workspace, & .wide .workspace": {
      padding: "26px 20px",
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
      padding: "8px 11px",
    },
    "& .overview-feature > img": {
      height: "180px",
    },
    "& .overview-feature h2": {
      "font-size": "24px",
    },
    "& .overview-columns": {
      gap: "28px",
    },
    "& .list-heading, & .page-row": {
      "grid-template-columns": "minmax(160px, 1fr) 60px 100px",
      gap: "12px",
      padding: "12px 6px",
    },
    "& .row-arrow": {
      display: "none",
    },
    "& .badge": {
      "font-size": "12px",
    },
    "& .page-identity": {
      gap: "10px",
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
      padding: "8px 0px 0px",
      "justify-content": "space-between",
    },
  },
  "@media (max-width: 540px)": {
    "& h1": {
      "font-size": "28px",
      "letter-spacing": "-1px",
    },
    "& .page-heading": {
      gap: "12px",
      "flex-wrap": "wrap",
    },
    "& .overview-feature": {
      padding: "22px",
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
      padding: "18px",
    },
    "& .inventory": {
      gap: "18px",
    },
    "& .wide .workspace": {
      "padding-left": "16px",
      "padding-right": "16px",
    },
    "& .workspace-bar": {
      padding: "10px 16px",
      gap: "10px",
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
