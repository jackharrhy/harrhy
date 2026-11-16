import { css } from "remix/component";
import { composeTheme, sluggersTheme } from "@harrhy/ui/theme";
import { originalBlue } from "../original.ts";
import type { LabConcept } from "./types.ts";
export const stadium: LabConcept = {
  id: "stadium",
  name: "Daylight Stadium",
  summary:
    "A bright stadium broadcast: sky-blue framing and yellow score digits.",
  source: "Game pitching HUD; stadium match statistics",
  changes:
    "Stepped blue scoreboards, compact score cells, capsule-free controls and a panoramic field.",
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
    selectedSurface: originalBlue[800],
    panelRadius: "10px",
    controlRadius: "6px",
    tableCellPadding: "8px 12px",
    tableBorder: "#759cca",
    dangerSurface: originalBlue[600],
    successSurface: originalBlue[600],
    hoverSurface: originalBlue[800],
    disabledSurface: originalBlue[700],
  }),
  parts: {
    contentColumns: "minmax(0,1.6fr) minmax(330px,1fr)",
    panelImage: `linear-gradient(${originalBlue[600]}, ${originalBlue[500]})`,
    headingImage: `linear-gradient(${originalBlue[400]}, ${originalBlue[700]})`,
    headingInk: "#ffffff",
    panelEdge: "2px solid #81bae8",
    cardRadius: "8px",
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
    "& [data-baseball-scoreboard]": {
      border: "2px solid #a4d7ff",
      background: "#1d548d",
    },
    "& [data-baseball-scoreboard] [data-total]": {
      background: `linear-gradient(${originalBlue[500]}, ${originalBlue[700]})`,
      color: "#fff1a1",
    },
    "& [data-roster-card]": {
      background: `linear-gradient(${originalBlue[500]}, ${originalBlue[700]})`,
      borderRadius: "6px",
    },
  }),
};
