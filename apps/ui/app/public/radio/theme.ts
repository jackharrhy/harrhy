import { composeTheme, tactileTheme, themeStyles } from "@harrhy/ui/theme";
import { css } from "remix/component";

export const DESKTOP_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const desktopColor = {
  ink: "var(--desktop-ink)",
  line: "var(--desktop-line)",
  paper: "var(--desktop-paper)",
  wash: "var(--desktop-wash)",
  stripe: "var(--desktop-stripe)",
  accent: "var(--desktop-accent)",
  accentSoft: "var(--desktop-accent-soft)",
} as const;

export const desktopThemeStyle = css({
  "--desktop-ink": "#1f2a31",
  "--desktop-line": "#7b878c",
  "--desktop-paper": "#f8fbfb",
  "--desktop-wash": "#dce4e7",
  "--desktop-stripe": "#c7d0d4",
  "--desktop-accent": "#2aa7b8",
  "--desktop-accent-soft": "#c9f4f8",
  color: desktopColor.ink,
  fontFamily: DESKTOP_FONT_FAMILY,
});

// Radio keeps its own skin; shared controls consume it through the public token contract.
export const radioControlsTheme = themeStyles(
  composeTheme(tactileTheme, {
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
    fontBody: DESKTOP_FONT_FAMILY,
    fontControl: DESKTOP_FONT_FAMILY,
    buttonTextSize: "14px",
  }),
);
