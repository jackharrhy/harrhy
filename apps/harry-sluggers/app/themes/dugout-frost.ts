import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { archiveTokens, archiveField } from "./foundation.ts";
import { originalBlue, originalSteel } from "../original.ts";
import type { LabConcept } from "./types.ts";

export const dugoutFrost: LabConcept = {
  field: archiveField,
  id: "dugout-frost",
  name: "Dugout Frost",
  summary:
    "Compact frosted utility: translucent blue panes, fine keylines and close-set horizontal records.",
  source:
    "Original bg-cell-gray/40 records; Dugout Link density. Blur is a new experiment, not an OG claim.",
  changes:
    "Small-radius utility panes use stronger 6px frosting over the source circles. One-column match records and shallow portrait rows keep the density of Dugout; narrow heading strips and a wider standings column prioritize scanning.",
  tokens: composeTheme(archiveTokens, {
    fontDisplay: "SluggersCezanne, Arial, sans-serif",
    controlRadius: "5px",
    tableSurface: "transparent",
    panelRadius: "8px",
    tableCellPadding: "7px 9px",
  }),
  parts: {
    headingInk: "#ffffff",
    headingImage: `linear-gradient(${originalBlue[500]}, ${originalBlue[700]})`,
    matchColumns: "minmax(0,1fr)",
    panelImage: `linear-gradient(${originalBlue[700]}2e,${originalBlue[700]}2e)`,
    panelSurface: `${originalSteel}66`,
    panelFilter: "blur(6px)",
    panelEdge: "1px solid #92b8dc",
    cardRadius: "5px",
    contentColumns: "minmax(300px,0.8fr) minmax(0,1.5fr)",
  },
  recipe: css({
    "& [data-panel-title]": { padding: "9px 12px", fontSize: "16px" },
    "& [data-match]": {
      padding: "10px 12px",
      background: `${originalBlue[700]}59`,
    },
    "& [data-match-meta]": { marginBottom: "6px" },
    "& [data-roster-card]": {
      borderRadius: "5px",
      padding: "9px 8px",
      gap: "3px",
    },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
