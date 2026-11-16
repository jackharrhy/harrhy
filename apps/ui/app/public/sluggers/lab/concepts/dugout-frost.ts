import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { dugout } from "./dugout.ts";
import { originalBlue, originalSteel } from "../original.ts";
import type { LabConcept } from "./types.ts";

export const dugoutFrost: LabConcept = {
  ...dugout,
  id: "dugout-frost",
  name: "Dugout Frost",
  parent: "Dugout Link",
  summary:
    "Compact frosted utility: translucent blue panes, fine keylines and close-set horizontal records.",
  source:
    "Original bg-cell-gray/40 records; Dugout Link density. Blur is a new experiment, not an OG claim.",
  changes:
    "Small-radius utility panes use stronger 6px frosting over the source circles. One-column match records and shallow portrait rows keep the density of Dugout; narrow heading strips and a wider standings column prioritize scanning.",
  tokens: composeTheme(dugout.tokens, {
    tableSurface: "transparent",
    panelRadius: "8px",
    tableCellPadding: "7px 9px",
  }),
  parts: {
    ...dugout.parts,
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
    "& [data-match-action]": { marginTop: "6px" },
    "& [data-roster-card]": {
      background: `${originalBlue[700]}66`,
      borderRadius: "5px",
      padding: "9px 8px",
      gap: "3px",
    },
    "& [data-roster-card] > img": { height: "48px" },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
      "& [data-match-teams]": {
        gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)",
      },
    },
  }),
};
