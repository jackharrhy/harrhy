import { space } from "@harrhy/ui/styles";
import { cleanTheme, composeTheme, themeStyles } from "@harrhy/ui/theme";

export const adminTheme = themeStyles(
  composeTheme(cleanTheme, {
    fontUi: '"Inter", ui-sans-serif, system-ui, sans-serif',
    textSize: "14px",
    controlHeight: "2.5rem",
    panelPadding: space(2.5),
  }),
);
