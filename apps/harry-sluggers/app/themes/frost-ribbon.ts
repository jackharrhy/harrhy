import { space } from "@harrhy/ui/styles";
import { css } from "remix/component";
import { composeTheme } from "@harrhy/ui/theme";
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
    panelRadius: "20px",
    controlRadius: "16px",
    tableCellPadding: `${space(1)} ${space(1.5)}`,
  }),
  parts: {
    ...broadcastPrism.parts,
    panelFilter: "blur(28px) saturate(1.25)",
    panelImage:
      "linear-gradient(180deg, rgb(255 255 255 / .04), transparent 48%)",
    headingImage: glassHeadingImage,
    cardRadius: "14px",
    surfaceTint: "#6782ad",
    matchColumns: "repeat(2,minmax(0,1fr))",
    contentColumns: "minmax(0,1fr)",
  },
  recipe: css({
    "& [data-lab-main]": { maxWidth: "1080px", gap: space(2) },
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": {
      fontSize: "20px",
      padding: `${space(1.25)} ${space(1.75)}`,
    },
    "& [data-match]": {
      padding: `${space(1.25)} ${space(1.5)}`,
      background: "var(--lab-card-surface)",
    },
    "& [data-match-meta]": { marginBottom: space(0.75) },
    "& [data-roster-card]": {
      borderRadius: "14px",
      padding: `${space(1.25)} ${space(1)}`,
      gap: space(0.375),
    },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
