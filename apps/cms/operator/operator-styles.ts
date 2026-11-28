import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";

export const operatorStyles = css({
  "& .operator-shell": {
    width: "min(1080px, calc(100% - 48px))",
    margin: "0 auto",
  },
  "& .operator-header": {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: space(3),
    "min-height": "76px",
    "border-bottom": "1px solid var(--line)",
  },
  "& .operator-account": {
    display: "flex",
    "align-items": "center",
    gap: space(3),
    color: "var(--muted)",
    "font-size": "13px",
  },
  "& .operator-account form": {
    margin: "0",
  },
  "& .operator-account a, & .operator-design-link": {
    color: "var(--muted)",
    "font-size": "12px",
  },
  "& .operator-heading": {
    padding: `${space(5.75)} 0 ${space(2.5)}`,
  },
  "& .operator-heading h1": {
    margin: "0",
  },
  "& .operator-sites": {
    display: "grid",
    gap: space(2),
    "padding-bottom": "64px",
  },
  "& .operator-shell > .operator-site": {
    "margin-block-end": "16px",
  },
  "& .operator-site": {
    display: "grid",
    "grid-template-columns": "minmax(0, 1.4fr) minmax(260px, 1fr) 136px",
    "align-items": "center",
    gap: space(3.5),
    padding: space(3.5),
  },
  "& .operator-site-head": {
    display: "flex",
    "align-items": "baseline",
    "flex-wrap": "wrap",
    gap: `${space(1)} ${space(2)}`,
    "margin-bottom": "6px",
  },
  "& .operator-site h2": {
    margin: "0",
    "font-size": "19px",
    "font-weight": "600",
    "line-height": "1.3",
  },
  "& .operator-description": {
    margin: `0 0 ${space(0.75)}`,
    color: "var(--muted)",
    "font-size": "13px",
  },
  "& .operator-origin": {
    color: "var(--accent)",
    "font-size": "13px",
    "overflow-wrap": "anywhere",
  },
  "& .operator-facts": {
    display: "grid",
    "grid-template-columns": "repeat(3, minmax(0, 1fr))",
    gap: `${space(1.25)} ${space(1.75)}`,
    margin: "0",
  },
  "& .operator-facts dt": {
    color: "var(--muted)",
    "font-size": "11px",
  },
  "& .operator-facts dd": {
    margin: `${space(0.125)} 0 0`,
    "font-size": "14px",
    "font-weight": "600",
  },
  "& .operator-site form": {
    margin: "0",
  },
  "& .operator-site form button": {
    width: "100%",
  },
  "& .operator-login": {
    display: "flex",
    "flex-direction": "column",
    "justify-content": "center",
    gap: space(4.5),
    width: "min(420px, calc(100% - 40px))",
    "min-height": "100dvh",
    margin: "0 auto",
    padding: `${space(5)} 0 ${space(9)}`,
  },
  "& .operator-login-panel h1": {
    margin: `0 0 ${space(3.5)}`,
  },
  "& .operator-login form": {
    display: "grid",
    gap: space(2),
  },
  "& .operator-login form button": {
    width: "100%",
    "margin-top": "12px",
  },
  "& .operator-design-link": {
    "align-self": "flex-start",
  },
  "@media (max-width: 900px)": {
    "& .operator-site": {
      "grid-template-columns": "minmax(0, 1fr) 136px",
      gap: `${space(2.25)} ${space(3)}`,
    },
    "& .operator-facts": {
      "grid-column": "1 / -1",
      "grid-row": "2",
      "grid-template-columns": "repeat(5, minmax(0, 1fr))",
    },
    "& .operator-site form": {
      "grid-column": "2",
      "grid-row": "1",
    },
  },
  "@media (max-width: 600px)": {
    "& .operator-shell": {
      width: "min(100% - 36px, 1080px)",
    },
    "& .operator-header": {
      "align-items": "flex-start",
      "flex-direction": "column",
      "justify-content": "center",
      gap: space(1.25),
      padding: `${space(2.25)} 0`,
    },
    "& .operator-account": {
      width: "100%",
      "justify-content": "space-between",
    },
    "& .operator-heading": {
      padding: `${space(4.75)} 0 ${space(2.25)}`,
    },
    "& .operator-site": {
      display: "block",
      padding: space(3),
    },
    "& .operator-facts": {
      "grid-template-columns": "repeat(3, minmax(0, 1fr))",
      margin: `${space(2.75)} 0`,
    },
    "& .operator-site form button": {
      width: "100%",
    },
  },
});
