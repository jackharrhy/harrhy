import {
  composeTheme,
  densityOverrides,
  dialTheme,
  themeStyles,
} from "@harrhy/ui/theme";
import { css } from "remix/component";

export const DESKTOP_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const desktopColor = {
  muted: "var(--desktop-muted)",
  ink: "var(--desktop-ink)",
  line: "var(--desktop-line)",
  paper: "var(--desktop-paper)",
  wash: "var(--desktop-wash)",
  stripe: "var(--desktop-stripe)",
  accent: "var(--desktop-accent)",
  accentSoft: "var(--desktop-accent-soft)",
} as const;

export const desktopThemeStyle = css({
  "--desktop-muted": "#526168",
  "--desktop-ink": "#1f2a31",
  "--desktop-line": "#7b878c",
  "--desktop-paper": "#f8fbfb",
  "--desktop-wash": "#dce4e7",
  "--desktop-stripe": "#c7d0d4",
  "--desktop-accent": "#2aa7b8",
  "--desktop-accent-soft": "#c9f4f8",
  "--radio-frame-image": `repeating-linear-gradient(${desktopColor.wash}, ${desktopColor.wash} 2px, ${desktopColor.stripe} 2px, ${desktopColor.stripe} 4px)`,
  "--radio-frame-radius": "6px",
  "--radio-frame-shadow":
    "0 0 0 1px #fff inset, 0 18px 50px rgba(15, 24, 28, 0.18)",
  "--radio-play-image": `linear-gradient(${desktopColor.accentSoft}, ${desktopColor.accentSoft})`,
  "--radio-title-ink": "#fff",
  "--radio-title-bg": "linear-gradient(#6d777c, #4d575d)",
  "--radio-title-shadow": "0 1px #000",
  color: desktopColor.ink,
  fontFamily: DESKTOP_FONT_FAMILY,
});

// Radio keeps its own skin; shared controls consume it through the public token contract.
export function radioControlsTheme(density: keyof typeof densityOverrides) {
  return themeStyles(
    composeTheme(
      dialTheme,
      {
        muted: "var(--desktop-muted)",
        ink: "var(--desktop-ink)",
        surface: "var(--desktop-paper)",
        accent: "#147582",
        onAccent: "#ffffff",
        focus: "#147582",
        controlBorder: "var(--desktop-line)",
        controlHeight: "30px",
        controlPadding: "0 10px",
        controlRadius: "3px",
        buttonHeight: "30px",
        buttonPadding: "0 10px",
        buttonBorder: "var(--desktop-ink)",
        buttonWeight: "400",
        buttonShadow: "0 1px #fff inset",
        buttonImage: "linear-gradient(#fff, #d9e1e4)",
        fontDisplay: DESKTOP_FONT_FAMILY,
        fontUi: DESKTOP_FONT_FAMILY,
        buttonTextSize: "14px",
      },
      densityOverrides[density],
    ),
  );
}

// Translate the desktop layout’s local roles without overriding the selected shared preset.
export const selectedDesktopThemeStyle = css({
  "--desktop-ink": "var(--hui-ink)",
  "--desktop-muted": "var(--hui-muted)",
  "--desktop-line": "var(--hui-control-border)",
  "--desktop-paper": "var(--hui-surface)",
  "--desktop-wash": "var(--hui-elevated)",
  "--desktop-stripe": "var(--hui-hover-surface)",
  "--desktop-accent": "var(--hui-accent)",
  "--desktop-accent-soft": "var(--hui-selected-surface)",
  color: desktopColor.ink,
});
