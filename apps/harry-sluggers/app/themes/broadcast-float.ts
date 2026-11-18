import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { originalBlue, originalSteel } from "../original.ts";
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
    tableCellPadding: "9px 16px",
  }),
  parts: {
    ...broadcastPrism.parts,
    panelSurface: `${originalSteel}3d`,
    panelFilter: "blur(24px) saturate(1.2)",
    panelImage: `linear-gradient(165deg, rgb(255 255 255 / .07), transparent 20%, ${originalBlue[900]}40 100%), linear-gradient(180deg, ${originalBlue[700]}73, ${originalBlue[800]}a6)`,
    headingImage: glassHeadingImage,
    cardRadius: "18px",
    cardSurface: "#274879",
    insetSurface: "#193560",
    matchColumns: "repeat(2,minmax(0,1fr))",
    contentColumns: "minmax(0,1fr)",
  },
  recipe: css({
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": { fontSize: "20px", padding: "14px 20px" },
    "& [data-match]": { padding: "14px", background: `${originalBlue[700]}59` },
    "& [data-roster-card]": {
      borderRadius: "20px",
      padding: "12px 10px",
    },
    "@media (min-width: 481px) and (max-width: 1000px)": {
      "& [data-match-list]": { gridTemplateColumns: "repeat(2,minmax(0,1fr))" },
    },
  }),
};
