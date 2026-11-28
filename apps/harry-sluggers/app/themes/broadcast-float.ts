import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { broadcastPrism } from "./broadcast-prism.ts";
import { glassEdges, glassHeadingImage } from "./foundation.ts";
import type { LabConcept } from "./types.ts";

export const broadcastFloat: LabConcept = {
  ...broadcastPrism,
  id: "broadcast-float",
  name: "Broadcast Float",
  parent: "Pennant Broadcast",
  summary:
    "Wide floating scorebook shelves: stronger 24px diffusion, rounded rims and a two-fixture broadcast strip.",
  changes:
    "Full-width glass shelves replace the sidebar. A clear upper reflection rolls into a cobalt lower glaze, with 24px blur and a soft inset edge. Two aligned fixture columns share the top shelf; standings and rounded portrait shelves follow below.",
  tokens: composeTheme(broadcastPrism.tokens, {
    panelRadius: "24px",
    controlRadius: "18px",
    tableCellPadding: `${space(1.125)} ${space(2)}`,
  }),
  parts: {
    ...broadcastPrism.parts,
    panelFilter: "blur(24px) saturate(1.2)",
    panelImage:
      "linear-gradient(165deg, rgb(255 255 255 / .04), transparent 48%)",
    headingImage: glassHeadingImage,
    cardRadius: "18px",
    surfaceTint: "#628ec7",
    matchColumns: "repeat(2,minmax(0,1fr))",
    contentColumns: "minmax(0,1fr)",
  },
  recipe: css({
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": {
      fontSize: "20px",
      padding: `${space(1.75)} ${space(2.5)}`,
    },
    "& [data-match]": {
      padding: space(1.75),
      background: "var(--lab-card-surface)",
    },
    "& [data-roster-card]": {
      borderRadius: "20px",
      padding: `${space(1.5)} ${space(1.25)}`,
    },
    "@media (min-width: 481px) and (max-width: 1000px)": {
      "& [data-match-list]": { gridTemplateColumns: "repeat(2,minmax(0,1fr))" },
    },
  }),
};
