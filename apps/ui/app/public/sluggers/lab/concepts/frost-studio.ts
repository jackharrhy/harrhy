import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { originalBlue, originalSteel } from "../original.ts";
import { broadcastPrism } from "./broadcast-prism.ts";
import { glassEdges, glassHeadingImage } from "./foundation.ts";
import type { LabConcept } from "./types.ts";

export const frostStudio: LabConcept = {
  ...broadcastPrism,
  id: "frost-studio",
  name: "Frost Studio",
  parent: "Dugout Frost",
  summary:
    "Dense frosted records with Broadcast headings: shallow rims, 12px blur and a wide standings work surface.",
  changes:
    "The compact result rail yields space to a wide standings pane. A restrained angled reflection and shallow lower tint keep the utility look, with 12px diffusion. Desktop portraits become horizontal three-column player records; narrow panels and rows stay tightly packed.",
  tokens: composeTheme(broadcastPrism.tokens, {
    panelRadius: "0.5rem",
    controlRadius: "0.375rem",
    tableCellPadding: "0.375rem 0.5625rem",
  }),
  parts: {
    ...broadcastPrism.parts,
    panelSurface: `${originalSteel}66`,
    panelFilter: "blur(0.75rem) saturate(1.1)",
    panelImage: `linear-gradient(120deg, rgb(255 255 255 / .035), transparent 24%), linear-gradient(180deg, ${originalBlue[700]}66, ${originalBlue[800]}80)`,
    headingImage: glassHeadingImage,
    cardRadius: "0.3125rem",
    matchColumns: "minmax(0,1fr)",
    contentColumns: "minmax(18.75rem,0.8fr) minmax(0,1.6fr)",
  },
  recipe: css({
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": {
      fontSize: "1.25rem",
      padding: "0.5625rem 0.75rem",
    },
    "& [data-match]": {
      padding: "0.5625rem 0.625rem",
      background: `${originalBlue[700]}4d`,
    },
    "& [data-match-meta]": { marginBottom: "0.3125rem" },
    "& [data-roster-card]": {
      background: `${originalBlue[700]}59`,
      borderRadius: "0.3125rem",
      padding: "0.5625rem",
      gap: "0.1875rem",
    },
    "@media (min-width: 62.5625rem)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(3,minmax(0,1fr))",
        gap: "0.375rem",
      },
    },
  }),
};
