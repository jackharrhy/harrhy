import { space } from "@harrhy/ui/styles";
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
    tableCellPadding: `${space(1)} ${space(1.5)}`,
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
    "& [data-lab-main]": { maxWidth: "67.5rem", gap: space(2) },
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": {
      fontSize: "1.25rem",
      padding: `${space(1.25)} ${space(1.75)}`,
    },
    "& [data-match]": {
      padding: `${space(1.25)} ${space(1.5)}`,
      background: `${originalBlue[700]}59`,
    },
    "& [data-match-meta]": { marginBottom: space(0.75) },
    "& [data-roster-card]": {
      background: `${originalBlue[700]}66`,
      borderRadius: "0.875rem",
      padding: `${space(1.25)} ${space(1)}`,
      gap: space(0.375),
    },
    "@media (min-width: 62.5625rem)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
