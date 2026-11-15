import { brutalistTheme, cleanTheme, tactileTheme } from "@harrhy/ui/theme";

export const themes = {
  clean: cleanTheme,
  tactile: tactileTheme,
  brutalist: brutalistTheme,
};
export type ThemeName = keyof typeof themes;
