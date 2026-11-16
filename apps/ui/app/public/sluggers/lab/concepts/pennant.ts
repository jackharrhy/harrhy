import { css } from "remix/component";
import { composeTheme, sluggersTheme } from "@harrhy/ui/theme";
import { originalBlue } from "../original.ts";
import type { LabConcept } from "./types.ts";
export const pennant: LabConcept = {
  id: "pennant",
  name: "Pennant Park",
  summary:
    "Blue broadcast framing, committed gradients and a close-packed scorebook.",
  source: "Batting & field positions; match statistics",
  changes:
    "Layered cobalt panels, blue chrome headers, red selection rails and mint/coral results.",
  tokens: composeTheme(sluggersTheme, {
    ink: "#ffffff",
    muted: "#eaf2ff",
    accent: "#fff1a1",
    onAccent: "#173866",
    danger: "#ffd7df",
    success: "#b6f7d1",
    border: "#88b3df",
    controlBorder: "#a4ccf4",
    selectedInk: "#ffffff",
    colorScheme: "dark",
    fontUi: "SluggersCezanne, Arial, sans-serif",
    tableHeaderTextSize: "12px",
    tableContainerSurface: "transparent",
    onDanger: "#173866",
    focus: "#fff1a1",
    buttonImage: "linear-gradient(rgb(255 255 255 / .10),rgb(255 255 255 / 0))",
    buttonShadow: "0 2px 3px rgb(0 0 0 / .12)",
    canvas: originalBlue[600],
    surface: originalBlue[600],
    elevated: originalBlue[700],
    tableSurface: originalBlue[600],
    tableHeader: originalBlue[700],
    selectedSurface: "#9a303c",
    tableBorder: "#759cca",
    dangerSurface: originalBlue[600],
    successSurface: originalBlue[600],
    hoverSurface: "#9a303c",
    disabledSurface: originalBlue[700],
  }),
  parts: {
    contentColumns: "minmax(0,1.3fr) minmax(360px,1fr)",
    panelImage: `linear-gradient(${originalBlue[500]}, ${originalBlue[700]})`,
    headingImage: `linear-gradient(${originalBlue[400]}, ${originalBlue[600]})`,
    headingInk: "#ffffff",
    panelEdge: "2px solid #89b6e8",
    cardRadius: "12px",
    matchColumns: "repeat(2,minmax(0,1fr))",
  },
  field: {
    grass: "#398466",
    infield: "#aa8056",
    line: "#e1f4d0",
    marker: originalBlue[600],
    portraitSize: "32px",
  },
  recipe: css({
    "& [data-lab-title]": { fontFamily: "SluggersHappiness, sans-serif" },
    "& [data-lab-panel]": { boxShadow: "0 5px 12px rgb(0 22 69 / .18)" },
    "& [data-roster-card]": {
      borderRadius: "10px",
      background: `linear-gradient(${originalBlue[500]}, ${originalBlue[700]})`,
    },
  }),
};
