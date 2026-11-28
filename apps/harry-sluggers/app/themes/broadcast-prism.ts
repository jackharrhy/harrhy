import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { originalSteel } from "../original.ts";
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
    tableCellPadding: `${space(1.125)} ${space(1.5)}`,
  }),
  parts: {
    ...dugoutFrost.parts,
    panelFilter: "blur(18px) saturate(1.15)",
    panelImage:
      "linear-gradient(132deg, rgb(255 255 255 / .04), transparent 48%)",
    headingImage: glassHeadingImage,
    cardRadius: "10px",
    surfaceTint: originalSteel,
    matchColumns: "minmax(0,1fr)",
    contentColumns: "minmax(0,1.4fr) minmax(340px,1fr)",
  },
  recipe: css({
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": {
      fontSize: "20px",
      padding: `${space(1.5)} ${space(2)}`,
    },
    "& [data-match]": {
      padding: space(1.5),
      background: "var(--lab-card-surface)",
    },
    "& [data-match-meta]": { marginBottom: space(1) },
    "& [data-roster-card]": {
      borderRadius: "10px",
      padding: space(1.25),
      gap: space(0.5),
    },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
