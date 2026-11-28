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
    panelRadius: "1rem",
    controlRadius: "0.625rem",
    tableCellPadding: "0.5625rem 0.75rem",
  }),
  parts: {
    ...dugoutFrost.parts,
    panelSurface: `${originalSteel}4d`,
    panelFilter: "blur(1.125rem) saturate(1.15)",
    panelImage: `linear-gradient(132deg, rgb(255 255 255 / .055), transparent 26%, ${originalBlue[900]}33 100%), linear-gradient(180deg, ${originalBlue[700]}66, ${originalBlue[800]}99)`,
    headingImage: glassHeadingImage,
    panelEdge: "0.0625rem solid #a4ccf4",
    cardRadius: "0.625rem",
    matchColumns: "minmax(0,1fr)",
    contentColumns: "minmax(0,1.4fr) minmax(21.25rem,1fr)",
  },
  recipe: css({
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": { fontSize: "1.25rem", padding: "0.75rem 1rem" },
    "& [data-match]": {
      padding: "0.75rem",
      background: `linear-gradient(135deg, ${originalBlue[600]}52, ${originalBlue[800]}66)`,
    },
    "& [data-match-meta]": { marginBottom: "0.5rem" },
    "& [data-roster-card]": {
      background: `${originalBlue[700]}66`,
      borderRadius: "0.625rem",
      padding: "0.625rem",
      gap: "0.25rem",
    },
    "@media (min-width: 62.5625rem)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
