import {
  brutalistTheme,
  cleanTheme,
  tactileTheme,
  sluggersTheme,
} from "@harrhy/ui/theme";

export const themes = {
  clean: cleanTheme,
  tactile: tactileTheme,
  brutalist: brutalistTheme,
  sluggers: sluggersTheme,
};
export type ThemeName = keyof typeof themes;

export const themeLabels: Record<ThemeName, string> = {
  clean: "Clean",
  tactile: "Radio",
  brutalist: "Artbin",
  sluggers: "Sluggers",
};
export const themeExports: Record<ThemeName, string> = {
  clean: "cleanTheme",
  tactile: "tactileTheme",
  brutalist: "brutalistTheme",
  sluggers: "sluggersTheme",
};
export const themeOptions = (Object.keys(themes) as ThemeName[]).map(
  (value) => ({ value, label: themeLabels[value] }),
);
