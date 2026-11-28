import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
import { originalBlue, originalSteel } from "../original.ts";
import { broadcastPrism } from "./broadcast-prism.ts";
import { glassEdges, glassHeadingImage } from "./foundation.ts";
import type { LabConcept } from "./types.ts";

export const frostRibbon: LabConcept = {
  ...broadcastPrism,
  id: "frost-ribbon",
  name: "Frost Ribbon",
  parent: "Dugout Frost",
  summary:
    "A focused 1080px glass scorebook: deep 28px diffusion, compact stacked panes and rounded portrait chips.",
  changes:
    "A narrower centered reading surface combines compact Frost records with Broadcast lettering. Tall top-to-bottom cobalt glazing gives stacked panes a softer depth, while 28px blur dissolves the circles behind them. Two fixture columns and four portrait columns keep the footprint small.",
  tokens: composeTheme(broadcastPrism.tokens, {
    panelRadius: "1.25rem",
    controlRadius: "1rem",
    tableCellPadding: "0.5rem 0.75rem",
  }),
  parts: {
    ...broadcastPrism.parts,
    panelSurface: `${originalSteel}52`,
    panelFilter: "blur(1.75rem) saturate(1.25)",
    panelImage: `linear-gradient(180deg, rgb(255 255 255 / .045), transparent 18%, ${originalBlue[900]}33 100%), linear-gradient(180deg, ${originalBlue[700]}73, ${originalBlue[800]}99)`,
    headingImage: glassHeadingImage,
    cardRadius: "0.875rem",
    matchColumns: "repeat(2,minmax(0,1fr))",
    contentColumns: "minmax(0,1fr)",
  },
  recipe: css({
    "& [data-lab-main]": { maxWidth: "67.5rem", gap: "1rem" },
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": {
      fontSize: "1.25rem",
      padding: "0.625rem 0.875rem",
    },
    "& [data-match]": {
      padding: "0.625rem 0.75rem",
      background: `${originalBlue[700]}59`,
    },
    "& [data-match-meta]": { marginBottom: "0.375rem" },
    "& [data-roster-card]": {
      background: `${originalBlue[700]}66`,
      borderRadius: "0.875rem",
      padding: "0.625rem 0.5rem",
      gap: "0.1875rem",
    },
    "@media (min-width: 62.5625rem)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
