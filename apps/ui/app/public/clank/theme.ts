import { cleanTheme, brutalistTheme, composeTheme } from "@harrhy/ui/theme";
export const skins = {
  Clean: cleanTheme,
  Artbin: brutalistTheme,
  Harrhy: composeTheme(cleanTheme, {
    fontUi: '"Clank Inter", system-ui, sans-serif',
    canvas: "#f5f3f0",
    surface: "#fbfaf8",
    ink: "#1d1b19",
    muted: "#6c665f",
    border: "#e7e4df",
    hoverSurface: "#f1eee9",
    selectedSurface: "#f0ede8",
    selectedInk: "#1d1b19",
    accent: "#1d1b19",
    focus: "#1d1b19",
    success: "#1f754d",
    controlBorder: "#77716a",
    panelRadius: "4px",
    controlRadius: "4px",
    textSize: "15px",
    controlHeight: "2rem",
    space: "0.5rem",
  }),
};
export type Skin = keyof typeof skins;
