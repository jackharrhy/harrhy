import { space } from "@harrhy/ui/styles";
import { cleanTheme, composeTheme, themeStyles } from "@harrhy/ui/theme";

export const woodTheme = themeStyles(
  composeTheme(cleanTheme, {
    colorScheme: "dark",
    canvas: "#15120e",
    surface: "#281a12",
    ink: "#f6ead2",
    muted: "#dbc9ac",
    border: "#9c7847",
    controlBorder: "#b48e55",
    disabledSurface: "#30251b",
    accent: "#e0bd78",
    onAccent: "#21160d",
    focus: "#ffdc9e",
    fontDisplay: "Georgia, serif",
    textSize: "0.875rem",
    controlHeight: "44px",
    controlPadding: `${space(1)} ${space(1.5)}`,
    controlRadius: "3px",
    panelRadius: "3px",
    panelPadding: `${space(1.25)} ${space(1.5)}`,
    panelImage:
      'linear-gradient(#281a1240, #281a1266), url("/textures/hall-trim-wood.webp")',
    buttonShadow: "inset 0 1px 0 #e4c58b40",
    space: space(1),
  }),
);
