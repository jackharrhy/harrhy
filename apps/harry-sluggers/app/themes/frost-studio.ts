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
    panelRadius: "8px",
    controlRadius: "6px",
    tableCellPadding: "6px 9px",
  }),
  parts: {
    ...broadcastPrism.parts,
    panelSurface: `${originalSteel}66`,
    panelFilter: "blur(12px) saturate(1.1)",
    panelImage: `linear-gradient(120deg, rgb(255 255 255 / .035), transparent 24%), linear-gradient(180deg, ${originalBlue[700]}66, ${originalBlue[800]}80)`,
    headingImage: glassHeadingImage,
    cardRadius: "5px",
    cardSurface: "#374e6d",
    insetSurface: "#243950",
    matchColumns: "minmax(0,1fr)",
    contentColumns: "minmax(300px,0.8fr) minmax(0,1.6fr)",
  },
  recipe: css({
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": { fontSize: "20px", padding: "9px 12px" },
    "& [data-match]": {
      padding: "9px 10px",
      background: `${originalBlue[700]}4d`,
    },
    "& [data-match-meta]": { marginBottom: "5px" },
    "& [data-roster-card]": {
      borderRadius: "5px",
      padding: "9px",
      gap: "3px",
    },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(3,minmax(0,1fr))",
        gap: "6px",
      },
    },
  }),
};
