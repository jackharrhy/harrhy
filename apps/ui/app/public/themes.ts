import {
  brutalistTheme,
  cleanTheme,
  graphiteTheme,
  dialTheme,
  sluggersTheme,
} from "@harrhy/ui/theme";

export const themes = {
  clean: cleanTheme,
  graphite: graphiteTheme,
  dial: dialTheme,
  brutalist: brutalistTheme,
  sluggers: sluggersTheme,
};
export type ThemeName = keyof typeof themes;

export const themeLabels: Record<ThemeName, string> = {
  clean: "Basic",
  graphite: "Graphite",
  dial: "Dial",
  brutalist: "Newspaper",
  sluggers: "Scorebook",
};
export const themeExports: Record<ThemeName, string> = {
  clean: "cleanTheme",
  graphite: "graphiteTheme",
  dial: "dialTheme",
  brutalist: "brutalistTheme",
  sluggers: "sluggersTheme",
};
export const themeOptions = (Object.keys(themes) as ThemeName[]).map(
  (value) => ({ value, label: themeLabels[value] }),
);
