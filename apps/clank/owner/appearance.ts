import type { Branding } from "./branding.ts";
import { extendTheme, graphiteTheme } from "@harrhy/ui/theme";
import { css } from "remix/component";
import {
  readThemeCookie,
  themeCookie,
  themeMode,
  type Mode,
} from "./theme-cookie.ts";

export { modes, type Mode } from "./theme-cookie.ts";
const legacyThemeKey = "clank:theme";

export function saveTheme(mode: Mode) {
  try {
    document.cookie = themeCookie(mode);
    // Cookie writes can fail silently. Keep the legacy copy until read-back succeeds.
    if (readThemeCookie(document.cookie) === mode)
      localStorage.removeItem(legacyThemeKey);
  } catch {}
}

export function hydratedTheme(serverMode?: Mode): Mode {
  let cookieMode = serverMode;
  try {
    cookieMode = readThemeCookie(document.cookie) ?? serverMode;
  } catch {}
  if (cookieMode) return cookieMode;
  try {
    const legacy = themeMode(localStorage.getItem(legacyThemeKey));
    if (legacy) {
      saveTheme(legacy);
      return legacy;
    }
  } catch {}
  return "system";
}

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

// P2's custom base, hover, message, code and line ramps, in the current scheme.
const tintPair = (light: string, dark: string) =>
  `light-dark(oklch(${light} var(--pi-base-hue)), oklch(${dark} var(--pi-base-hue)))`;

export const ownerScheme = css({
  "&[data-pi-tint=custom]": {
    "--hui-surface": tintPair("0.985 0.012", "0.19 0.022"),
    "--hui-canvas": tintPair("0.96 0.017", "0.21 0.022"),
    "--hui-elevated": tintPair("0.985 0.012", "0.19 0.022"),
    "--hui-hover-surface": tintPair("0.95 0.022", "0.24 0.028"),
    "--hui-selected-surface": tintPair("0.94 0.025", "0.26 0.03"),
    "--hui-border": tintPair("0.91 0.018", "0.29 0.024"),
  },
  "&[data-theme=light]": { "--hui-color-scheme": "light" },
  "&[data-theme=dark]": { "--hui-color-scheme": "dark" },
  "@media (prefers-color-scheme: dark)": {
    "&:not([data-theme])": { "--hui-color-scheme": "dark" },
  },
});

// One owner connection owns these document effects; never persist them as preferences.
export function documentBranding(doc: Document) {
  const root = doc.documentElement;
  const defaultTitle = doc.title;
  let icon: HTMLLinkElement | undefined;
  let previous: Branding | undefined;
  return (next?: Branding) => {
    if (previous?.name !== next?.name) doc.title = next?.name ?? defaultTitle;
    if (previous?.tint !== next?.tint) {
      if (next?.tint != null) {
        root.style.setProperty("--pi-base-hue", String(next.tint));
        root.dataset.piTint = "custom";
      } else {
        root.style.removeProperty("--pi-base-hue");
        delete root.dataset.piTint;
      }
    }
    if (previous?.logo !== next?.logo) {
      if (next?.logo) {
        if (!icon) {
          icon = doc.createElement("link");
          icon.rel = "icon";
          icon.type = "image/png";
        }
        icon.href = next.logo;
        if (!icon.isConnected) doc.head.appendChild(icon);
      } else {
        icon?.remove();
        icon = undefined;
      }
    }
    previous = next;
  };
}
