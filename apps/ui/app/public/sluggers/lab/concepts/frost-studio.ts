import { space } from "@harrhy/ui/styles";
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
    tableCellPadding: `${space(0.75)} ${space(1.125)}`,
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
      padding: `${space(1.125)} ${space(1.5)}`,
    },
    "& [data-match]": {
      padding: `${space(1.125)} ${space(1.25)}`,
      background: `${originalBlue[700]}4d`,
    },
    "& [data-match-meta]": { marginBottom: space(0.625) },
    "& [data-roster-card]": {
      background: `${originalBlue[700]}59`,
      borderRadius: "0.3125rem",
      padding: space(1.125),
      gap: space(0.375),
    },
    "@media (min-width: 62.5625rem)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(3,minmax(0,1fr))",
        gap: space(0.75),
      },
    },
  }),
};
