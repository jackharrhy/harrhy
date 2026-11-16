import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { dugout } from "./dugout.ts";
import { originalBlue } from "../original.ts";
import type { LabConcept } from "./types.ts";

export const dugoutLedger: LabConcept = {
  ...dugout,
  id: "dugout-ledger",
  name: "Dugout Ledger",
  parent: "Dugout Link",
  summary:
    "An opaque archive ledger: flat ruled rows, square score slips and horizontal player records.",
  source: "Original dense standings/leaderboards; Dugout Link utility",
  changes:
    "A single full-width record stack favors cross-row comparison. Flat rectangular fixtures form a two-column ledger; desktop portraits become horizontal labelled records rather than six tall cards. No translucency or blur.",
  tokens: composeTheme(dugout.tokens, {
    panelRadius: "3px",
    controlRadius: "4px",
    tableCellPadding: "6px 10px",
  }),
  parts: {
    ...dugout.parts,
    panelImage: "none",
    headingImage: `linear-gradient(${originalBlue[600]},${originalBlue[700]})`,
    cardRadius: "2px",
    contentColumns: "minmax(0,1fr)",
    matchColumns: "repeat(2,minmax(0,1fr))",
  },
  recipe: css({
    "& [data-panel-title]": {
      padding: "8px 12px",
      fontSize: "16px",
      borderBottom: "1px solid #88b3df",
    },
    "& [data-match]": {
      padding: "10px 12px",
      borderRadius: "2px",
      background: originalBlue[700],
    },
    "& [data-match-meta]": { marginBottom: "6px" },
    "& [data-match-action]": { marginTop: "6px" },
    "& [data-roster-card]": {
      background: originalBlue[600],
      borderRadius: "2px",
      padding: "10px",
      gap: "4px",
    },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]": {
        gridTemplateColumns: "repeat(3,minmax(0,1fr))",
        gap: "1px",
      },
      "& [data-roster-card]": {
        display: "grid",
        gridTemplateColumns: "48px minmax(0,1fr)",
        textAlign: "left",
        alignItems: "center",
        "& > img, & > [data-portrait-missing]": {
          gridRow: "1 / 5",
          width: "44px",
          height: "44px",
        },
        "& > [data-card-stats]": { marginTop: 0 },
      },
    },
  }),
};
