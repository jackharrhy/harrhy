import { space } from "@harrhy/ui/styles";
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
    controlRadius: "0.3125rem",
    tableSurface: "transparent",
    panelRadius: "0.5rem",
    tableCellPadding: `${space(0.875)} ${space(1.125)}`,
  }),
  parts: {
    headingInk: "#ffffff",
    headingImage: `linear-gradient(${originalBlue[500]}, ${originalBlue[700]})`,
    matchColumns: "minmax(0,1fr)",
    panelImage: `linear-gradient(${originalBlue[700]}2e,${originalBlue[700]}2e)`,
    panelSurface: `${originalSteel}66`,
    panelFilter: "blur(0.375rem)",
    panelEdge: "0.0625rem solid #92b8dc",
    cardRadius: "0.3125rem",
    contentColumns: "minmax(18.75rem,0.8fr) minmax(0,1.5fr)",
  },
  recipe: css({
    "& [data-panel-title]": {
      padding: `${space(1.125)} ${space(1.5)}`,
      fontSize: "1rem",
    },
    "& [data-match]": {
      padding: `${space(1.25)} ${space(1.5)}`,
      background: `${originalBlue[700]}59`,
    },
    "& [data-match-meta]": { marginBottom: space(0.75) },
    "& [data-roster-card]": {
      background: `${originalBlue[700]}66`,
      borderRadius: "0.3125rem",
      padding: `${space(1.125)} ${space(1)}`,
      gap: space(0.375),
    },
    "@media (min-width: 62.5625rem)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
