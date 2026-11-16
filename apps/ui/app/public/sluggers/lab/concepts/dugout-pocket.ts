import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { dugout } from "./dugout.ts";
import { originalBlue } from "../original.ts";
import type { LabConcept } from "./types.ts";

export const dugoutPocket: LabConcept = {
  ...dugout,
  id: "dugout-pocket",
  name: "Dugout Pocket",
  parent: "Dugout Link",
  summary:
    "A compact handheld scorebook: a centered narrow shell, stacked screens and rounded blue chips.",
  source:
    "Dugout Link compactness; original lineup-position rail and rounded controls",
  changes:
    "The desktop shell narrows to 1080px and all primary panels stack. Twin fixture columns and four-across portrait chips put the compactness inside a rounded handheld-like frame; opaque materials avoid a second glass variation.",
  tokens: composeTheme(dugout.tokens, {
    panelRadius: "18px",
    controlRadius: "16px",
    tableCellPadding: "8px 12px",
  }),
  parts: {
    ...dugout.parts,
    panelImage: `linear-gradient(${originalBlue[600]},${originalBlue[700]})`,
    headingImage: `linear-gradient(${originalBlue[500]},${originalBlue[700]})`,
    panelEdge: "2px solid #88b3df",
    cardRadius: "14px",
    contentColumns: "minmax(0,1fr)",
    matchColumns: "repeat(2,minmax(0,1fr))",
  },
  recipe: css({
    "& [data-lab-main]": { maxWidth: "1080px", gap: "16px" },
    "& [data-panel-title]": { padding: "10px 14px", fontSize: "16px" },
    "& [data-match]": {
      padding: "12px",
      borderRadius: "14px",
      background: originalBlue[600],
    },
    "& [data-roster-card]": {
      background: originalBlue[700],
      borderRadius: "14px",
      padding: "10px 8px",
      gap: "3px",
    },
    "& [data-roster-card] > img": { height: "48px" },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
