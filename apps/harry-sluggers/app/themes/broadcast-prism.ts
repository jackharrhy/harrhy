import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { originalBlue, originalSteel } from "../original.ts";
import { dugoutFrost } from "./dugout-frost.ts";
import { glassEdges, glassHeadingImage } from "./foundation.ts";
import type { LabConcept } from "./types.ts";

export const broadcastPrism: LabConcept = {
  ...dugoutFrost,
  id: "broadcast-prism",
  name: "Broadcast Prism",
  parent: "Pennant Broadcast",
  summary:
    "Broadcast lettering over Frost-blue glass: faceted gradients, 18px diffusion and compact score windows.",
  source:
    "Pennant Broadcast header typography + Dugout Frost steel tint; original blue/circle canvas",
  changes:
    "A broad fixture board and standings rail share layered cobalt glass. A diagonal sheen, darker lower edge and inner rim give gradients a material job; 18px backdrop diffusion softens the original circles without a viewport-sized filter.",
  tokens: composeTheme(dugoutFrost.tokens, {
    fontDisplay: "SluggersRodin, Arial, sans-serif",
    panelRadius: "16px",
    controlRadius: "10px",
    tableCellPadding: "9px 12px",
  }),
  parts: {
    ...dugoutFrost.parts,
    panelSurface: `${originalSteel}4d`,
    panelFilter: "blur(18px) saturate(1.15)",
    panelImage: `linear-gradient(132deg, rgb(255 255 255 / .055), transparent 26%, ${originalBlue[900]}33 100%), linear-gradient(180deg, ${originalBlue[700]}66, ${originalBlue[800]}99)`,
    headingImage: glassHeadingImage,
    panelEdge: "1px solid #a4ccf4",
    cardRadius: "10px",
    cardSurface: "#203c61",
    insetSurface: "#172e50",
    matchColumns: "minmax(0,1fr)",
    contentColumns: "minmax(0,1.4fr) minmax(340px,1fr)",
  },
  recipe: css({
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": { fontSize: "20px", padding: "12px 16px" },
    "& [data-match]": {
      padding: "12px",
      background: `linear-gradient(135deg, ${originalBlue[600]}52, ${originalBlue[800]}66)`,
    },
    "& [data-match-meta]": { marginBottom: "8px" },
    "& [data-roster-card]": {
      borderRadius: "10px",
      padding: "10px",
      gap: "4px",
    },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
