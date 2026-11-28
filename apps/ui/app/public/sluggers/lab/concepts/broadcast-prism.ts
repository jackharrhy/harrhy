import { space } from "@harrhy/ui/styles";
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
    tableCellPadding: `${space(1.125)} ${space(1.5)}`,
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
    "& [data-panel-title]": {
      fontSize: "1.25rem",
      padding: `${space(1.5)} ${space(2)}`,
    },
    "& [data-match]": {
      padding: space(1.5),
      background: `linear-gradient(135deg, ${originalBlue[600]}52, ${originalBlue[800]}66)`,
    },
    "& [data-match-meta]": { marginBottom: space(1) },
    "& [data-roster-card]": {
      background: `${originalBlue[700]}66`,
      borderRadius: "0.625rem",
      padding: space(1.25),
      gap: space(0.5),
    },
    "@media (min-width: 62.5625rem)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
