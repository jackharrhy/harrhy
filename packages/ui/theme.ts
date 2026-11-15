import { css } from "remix/component";

/** Semantic values and part recipes. Surfaces and images are deliberately separate. */
export interface ThemeTokens {
  canvas: string;
  surface: string;
  elevated: string;
  ink: string;
  muted: string;
  border: string;
  controlBorder: string;
  accent: string;
  onAccent: string;
  focus: string;
  danger: string;
  onDanger: string;
  dangerSurface: string;
  success: string;
  successSurface: string;
  fontBody: string;
  fontControl: string;
  fontCode: string;
  textSize: string;
  lineHeight: string;
  space: string;
  controlHeight: string;
  controlPadding: string;
  controlRadius: string;
  borderWidth: string;
  panelRadius: string;
  panelPadding: string;
  panelImage: string;
  buttonImage: string;
  buttonShadow: string;
  buttonWeight: string;
  controlShadow: string;
  overlayShadow: string;
  motion: string;
}

export const cleanTheme: Readonly<ThemeTokens> = {
  canvas: "#f6f7f8",
  surface: "#ffffff",
  elevated: "#ffffff",
  ink: "#192126",
  muted: "#536169",
  border: "#d8dfe2",
  controlBorder: "#87959d",
  accent: "#243f4d",
  onAccent: "#ffffff",
  focus: "#006c9c",
  danger: "#a3202c",
  onDanger: "#ffffff",
  dangerSurface: "#fff0f1",
  success: "#17613c",
  successSurface: "#eaf6ee",
  fontBody: "system-ui, sans-serif",
  fontControl: "inherit",
  fontCode: "ui-monospace, monospace",
  textSize: "1rem",
  lineHeight: "1.5",
  space: "0.75rem",
  controlHeight: "2.75rem",
  controlPadding: "0.5rem 0.875rem",
  controlRadius: "0.375rem",
  borderWidth: "1px",
  panelRadius: "0.5rem",
  panelPadding: "1.25rem",
  panelImage: "none",
  buttonImage: "none",
  buttonShadow: "none",
  buttonWeight: "600",
  controlShadow: "none",
  overlayShadow: "0 16px 48px rgb(0 0 0 / 0.2)",
  motion: "120ms",
};

/** Composition happens in data, not by relying on mix array cascade order. */
export function composeTheme(
  base: Readonly<ThemeTokens>,
  ...overrides: Partial<ThemeTokens>[]
): ThemeTokens {
  return Object.assign({}, base, ...overrides);
}

export const tactileTheme = composeTheme(cleanTheme, {
  canvas: "#edf5f5",
  surface: "#f9fdfb",
  elevated: "#ffffff",
  ink: "#203a3c",
  muted: "#466367",
  border: "#98b6b7",
  controlBorder: "#587c81",
  accent: "#b5eff2",
  onAccent: "#173c42",
  focus: "#006579",
  controlRadius: "3px",
  panelRadius: "5px",
  borderWidth: "1px",
  buttonWeight: "700",
  panelImage:
    "repeating-linear-gradient(0deg, transparent 0 3px, rgb(35 94 99 / 0.045) 3px 4px)",
  buttonImage:
    "linear-gradient(180deg, rgb(255 255 255 / 0.65), transparent 55%, rgb(0 45 58 / 0.08))",
  buttonShadow: "inset 0 1px 0 #fff, 0 2px 0 #79989a",
  controlShadow: "inset 0 1px 2px rgb(0 45 58 / 0.15)",
});

export const brutalistTheme = composeTheme(cleanTheme, {
  canvas: "#eeeeec",
  surface: "#ffffff",
  elevated: "#ffffff",
  ink: "#161616",
  muted: "#50504d",
  border: "#161616",
  controlBorder: "#161616",
  accent: "#d8ff3e",
  onAccent: "#161616",
  focus: "#0756bd",
  controlRadius: "0",
  panelRadius: "0",
  borderWidth: "2px",
  buttonWeight: "750",
  buttonShadow: "3px 3px 0 #161616",
});

export function themeStyles(theme: Readonly<ThemeTokens>) {
  return css(
    Object.fromEntries(
      Object.entries(theme).map(([key, value]) => [
        `--hui-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        value,
      ]),
    ),
  );
}

export const themeRoot = css({
  color: "var(--hui-ink)",
  backgroundColor: "var(--hui-canvas)",
  fontFamily: "var(--hui-font-body)",
  fontSize: "var(--hui-text-size)",
  lineHeight: "var(--hui-line-height)",
  accentColor: "var(--hui-accent)",
  caretColor: "var(--hui-ink)",
  "& ::selection": {
    background: "var(--hui-accent)",
    color: "var(--hui-on-accent)",
  },
  "@media (prefers-reduced-motion: reduce)": { "--hui-motion": "0ms" },
});
