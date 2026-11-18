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
    tableCellPadding: "8px 12px",
  }),
  parts: {
    ...broadcastPrism.parts,
    panelFilter: "blur(28px) saturate(1.25)",
    panelImage:
      "linear-gradient(180deg, rgb(255 255 255 / .04), transparent 48%)",
    headingImage: glassHeadingImage,
    cardRadius: "14px",
    surfaceTint: "#6782ad",
    insetSurface: "#2b5087",
    matchColumns: "repeat(2,minmax(0,1fr))",
    contentColumns: "minmax(0,1fr)",
  },
  recipe: css({
    "& [data-lab-main]": { maxWidth: "1080px", gap: "16px" },
    "& [data-lab-panel]": glassEdges,
    "& [data-panel-title]": { fontSize: "20px", padding: "10px 14px" },
    "& [data-match]": {
      padding: "10px 12px",
      background: "var(--lab-card-surface)",
    },
    "& [data-match-meta]": { marginBottom: "6px" },
    "& [data-roster-card]": {
      borderRadius: "14px",
      padding: "10px 8px",
      gap: "3px",
    },
    "@media (min-width: 1001px)": {
      "& [data-roster-grid]:not([data-catalogue-grid])": {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      },
    },
  }),
};
