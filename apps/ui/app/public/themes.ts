import {
  brutalistTheme,
  cleanTheme,
  graphiteTheme,
  dialTheme,
  sluggersTheme,
} from "@harrhy/ui/theme";

export const themes = {
  basic: cleanTheme,
  graphite: graphiteTheme,
  dial: dialTheme,
  newspaper: brutalistTheme,
  scorebook: sluggersTheme,
};
export type ThemeName = keyof typeof themes;

export const themeLabels: Record<ThemeName, string> = {
  basic: "Basic",
  graphite: "Graphite",
  dial: "Dial",
  newspaper: "Newspaper",
  scorebook: "Scorebook",
};
export const themeExports: Record<ThemeName, string> = {
  basic: "cleanTheme",
  graphite: "graphiteTheme",
  dial: "dialTheme",
  newspaper: "brutalistTheme",
  scorebook: "sluggersTheme",
};
export const themeOptions = (Object.keys(themes) as ThemeName[]).map(
  (value) => ({ value, label: themeLabels[value] }),
);
