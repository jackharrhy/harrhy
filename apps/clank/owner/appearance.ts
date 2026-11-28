import { extendTheme, graphiteTheme } from "@harrhy/ui/theme";
import { css } from "remix/component";

export const modes = ["system", "light", "dark"] as const;
export type Mode = (typeof modes)[number];
export const themeKey = "clank:theme";
export const themeBootstrap = `try{const mode=localStorage.getItem(${JSON.stringify(themeKey)});if(mode==="light"||mode==="dark")document.documentElement.dataset.theme=mode}catch{}`;

export const ownerTheme = extendTheme(graphiteTheme, {
  canvas: "light-dark(#f5f3f0, #151413)",
  surface: "light-dark(#fbfaf8, #151413)",
  elevated: "light-dark(#fff, #1a1918)",
  ink: "light-dark(#1d1b19, #ecebe8)",
  muted: "light-dark(#6c665f, #9b958d)",
  border: "light-dark(#e7e4df, #2c2a27)",
  hoverSurface: "light-dark(#f1eee9, #22201e)",
  selectedSurface: "light-dark(#f0ede8, #252321)",
  selectedInk: "var(--hui-ink)",
  disabledSurface: "light-dark(#edf0f2, #252321)",
  accent: "var(--hui-ink)",
  onAccent: "var(--hui-surface)",
  focus: "var(--hui-ink)",
  success: "light-dark(#1f754d, #5cc493)",
  danger: "light-dark(#a3202c, #f07a72)",
  control: { border: "light-dark(#77716a, #77716a)" },
});

export const ownerScheme = css({
  colorScheme: "light dark",
  "&:is([data-theme=light] *)": { colorScheme: "light" },
  "&:is([data-theme=dark] *)": { colorScheme: "dark" },
});
