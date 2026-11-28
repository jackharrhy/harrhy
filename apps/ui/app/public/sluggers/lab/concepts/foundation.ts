import { composeTheme, sluggersTheme } from "@harrhy/ui/theme";
import type { BaseballFieldPaint } from "@harrhy/ui/baseball";
import { originalBlue } from "../original.ts";

export const archiveTokens = composeTheme(sluggersTheme, {
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
  fontDisplay: "SluggersRodin, Arial, sans-serif",
  tableHeaderTextSize: "0.75rem",
  tableContainerSurface: "transparent",
  onDanger: "#173866",
  focus: "#fff1a1",
  buttonImage: "linear-gradient(rgb(255 255 255 / .10),rgb(255 255 255 / 0))",
  buttonShadow: "0 0.125rem 0.1875rem rgb(0 0 0 / .12)",
  canvas: originalBlue[600],
  surface: originalBlue[600],
  elevated: originalBlue[700],
  tableSurface: originalBlue[600],
  tableHeader: originalBlue[700],
  selectedSurface: originalBlue[800],
  tableBorder: "#759cca",
  dangerSurface: originalBlue[600],
  successSurface: originalBlue[600],
  hoverSurface: originalBlue[800],
  disabledSurface: originalBlue[700],
});
export const glassHeadingImage = `linear-gradient(180deg, rgb(255 255 255 / .07), transparent 48%), linear-gradient(100deg, ${originalBlue[500]}e6, ${originalBlue[700]}b3)`;
export const glassEdges = {
  boxShadow:
    "inset 0 0.0625rem 0 rgb(255 255 255 / .22), inset 0 -0.0625rem 0 rgb(17 45 112 / .20), 0 0.5rem 1.25rem rgb(17 45 112 / .18)",
  borderColor: "rgb(164 204 244 / .55)",
};

export const archiveField: BaseballFieldPaint = {
  grass: "#398466",
  infield: "#aa8056",
  line: "#e1f4d0",
  marker: originalBlue[600],
  portraitSize: "2rem",
};
