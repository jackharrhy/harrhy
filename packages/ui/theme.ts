import { css } from "remix/component";

/** Semantic values and part recipes. Surfaces and images are deliberately separate. */
export interface ThemeTokens {
  colorScheme: "light" | "dark";
  canvas: string;
  surface: string;
  elevated: string;
  ink: string;
  muted: string;
  border: string;
  controlBorder: string;
  hoverSurface: string;
  selectedSurface: string;
  selectedInk: string;
  disabledSurface: string;
  popupOffset: string;
  tableBorder: string;
  tableSurface: string;
  tableContainerSurface: string;
  tableStripe: string;
  tableTextSize: string;
  tableHeaderTextSize: string;
  tableCellPadding: string;
  tableColumnBorder: string;
  tableHeader: string;
  tableHeaderImage: string;
  tableHeaderShadow: string;
  popupRadius: string;
  popupPadding: string;
  optionRadius: string;
  optionGap: string;
  buttonBorder: string;
  buttonPrimaryBorder: string;
  buttonHeight: string;
  buttonPadding: string;
  buttonTextSize: string;
  controlTextSize: string;
  labelSize: string;
  labelWeight: string;
  labelTransform: string;
  labelTracking: string;
  fieldGap: string;
  accent: string;
  onAccent: string;
  focus: string;
  danger: string;
  onDanger: string;
  dangerSurface: string;
  success: string;
  successSurface: string;
  fontDisplay: string;
  fontUi: string;
  fontDetail: string;
  fontMono: string;
  fontDisplayVariation: string;
  fontDisplayOpticalSizing: string;
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
  colorScheme: "light",
  canvas: "#f6f7f8",
  surface: "#ffffff",
  elevated: "#ffffff",
  ink: "#192126",
  muted: "#536169",
  border: "#d8dfe2",
  controlBorder: "#7d8b94",
  hoverSurface: "#edf0f2",
  selectedSurface: "#dfe9ed",
  selectedInk: "#243f4d",
  disabledSurface: "#edf0f2",
  popupOffset: "6px",
  tableBorder: "var(--hui-border)",
  tableSurface: "var(--hui-surface)",
  tableContainerSurface: "var(--hui-table-surface)",
  tableStripe: "transparent",
  tableTextSize: "0.875rem",
  tableHeaderTextSize: "inherit",
  tableCellPadding: "0.625rem 0.75rem",
  tableColumnBorder: "0 solid transparent",
  tableHeader: "var(--hui-surface)",
  tableHeaderImage: "none",
  tableHeaderShadow: "none",
  popupRadius: "10px",
  popupPadding: "6px",
  optionRadius: "6px",
  optionGap: "2px",
  buttonBorder: "var(--hui-control-border)",
  buttonPrimaryBorder: "var(--hui-button-border)",
  buttonHeight: "var(--hui-control-height)",
  buttonPadding: "var(--hui-control-padding)",
  buttonTextSize: "inherit",
  controlTextSize: "inherit",
  labelSize: "inherit",
  labelWeight: "600",
  labelTransform: "none",
  labelTracking: "normal",
  fieldGap: "0.5rem",
  accent: "#243f4d",
  onAccent: "#ffffff",
  focus: "#006c9c",
  danger: "#a3202c",
  onDanger: "#ffffff",
  dangerSurface: "#fff0f1",
  success: "#17613c",
  successSurface: "#eaf6ee",
  fontDisplay: "var(--hui-font-ui)",
  fontUi: "system-ui, sans-serif",
  fontDetail: "var(--hui-font-ui)",
  fontMono: "ui-monospace, monospace",
  fontDisplayVariation: "normal",
  fontDisplayOpticalSizing: "auto",
  textSize: "1rem",
  lineHeight: "1.5",
  space: "0.75rem",
  controlHeight: "2.25rem",
  controlPadding: "0.375rem 0.625rem",
  controlRadius: "0.375rem",
  borderWidth: "1px",
  panelRadius: "0.5rem",
  panelPadding: "1rem",
  panelImage: "none",
  buttonImage: "none",
  buttonShadow: "none",
  buttonWeight: "600",
  controlShadow: "none",
  overlayShadow: "0 8px 24px rgb(25 33 38 / 0.14)",
  motion: "120ms",
};

/** Composition happens in data, not by relying on mix array cascade order. */
export function composeTheme(
  base: Readonly<ThemeTokens>,
  ...overrides: Partial<ThemeTokens>[]
): ThemeTokens {
  return Object.assign({}, base, ...overrides);
}

// Table treatment follows Radio room utility headers and fine desktop list rules.
export const tactileTheme = composeTheme(cleanTheme, {
  tableBorder: "#7b878c",
  tableSurface: "#f8fbfb",
  tableStripe: "#edf2f4",
  tableTextSize: "13px",
  tableCellPadding: "0.4375rem 0.625rem",
  tableColumnBorder: "1px solid #dce4e7",
  tableHeader: "#dce4e7",
  tableHeaderImage: "linear-gradient(#f8fbfb, #dce4e7)",
  tableHeaderShadow: "inset 0 1px #fff",
  canvas: "#edf5f5",
  surface: "#f9fdfb",
  elevated: "#ffffff",
  ink: "#203a3c",
  muted: "#466367",
  border: "#98b6b7",
  controlBorder: "#587c81",
  hoverSurface: "#e2f1ee",
  selectedSurface: "#c7e9e7",
  selectedInk: "#173c42",
  disabledSurface: "#e7efed",
  popupRadius: "5px",
  popupPadding: "3px",
  optionRadius: "2px",
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

/** Artbin app/ui/styles.ts: flat archive-catalog surfaces, not neobrutalism. */
export const brutalistTheme = composeTheme(cleanTheme, {
  canvas: "#f0f0f0",
  surface: "#ffffff",
  elevated: "#ffffff",
  ink: "#111111",
  muted: "#666666",
  border: "#cccccc",
  controlBorder: "#888888",
  hoverSurface: "#eeeeee",
  selectedSurface: "#dddddd",
  selectedInk: "#111111",
  disabledSurface: "#f0f0f0",
  popupRadius: "0",
  popupPadding: "4px",
  optionRadius: "0",
  buttonBorder: "#222222",
  buttonPrimaryBorder: "#111111",
  accent: "#111111",
  onAccent: "#ffffff",
  focus: "#222222",
  danger: "#cc0000",
  dangerSurface: "#fff0f0",
  success: "#008700",
  successSurface: "#f0fff0",
  fontDisplay: '"Fraunces", Georgia, serif',
  fontUi: '"IBM Plex Sans", Arial, sans-serif',
  fontMono: '"IBM Plex Mono", "Courier New", monospace',
  fontDetail: "var(--hui-font-mono)",
  fontDisplayVariation: '"SOFT" 30, "WONK" 1',
  fontDisplayOpticalSizing: "auto",
  lineHeight: "1.45",
  space: "0.625rem",
  controlHeight: "2.125rem",
  controlPadding: "0.4375rem 0.625rem",
  controlTextSize: "0.875rem",
  buttonHeight: "2rem",
  buttonPadding: "0.375rem 0.75rem",
  buttonTextSize: "0.875rem",
  labelSize: "0.75rem",
  labelWeight: "500",
  labelTransform: "uppercase",
  labelTracking: "0.025em",
  fieldGap: "0.375rem",
  controlRadius: "0",
  panelRadius: "0",
  panelPadding: "1rem",
  borderWidth: "1px",
  buttonWeight: "400",
  buttonShadow: "none",
  overlayShadow: "none",
});

/** Sluggers blue scorebook palette; private font assets are host-owned and opt-in. */
export const sluggersTheme: Readonly<ThemeTokens> = composeTheme(cleanTheme, {
  colorScheme: "dark",
  canvas: "oklch(48.197% 0.17551 261.35)",
  surface: "#3b64a8",
  elevated: "#416aac",
  ink: "#ffffff",
  muted: "#d6e3fa",
  border: "rgb(155 181 225 / 0.55)",
  controlBorder: "#93add5",
  hoverSurface: "rgb(142 170 215 / 0.2)",
  selectedSurface: "#486fb0",
  selectedInk: "#ffffff",
  disabledSurface: "#41629b",
  accent: "#fff1a1",
  onAccent: "#173866",
  focus: "#ffe77d",
  danger: "#ffc1c6",
  onDanger: "#173866",
  dangerSurface: "#58374d",
  success: "#a6f0c2",
  successSurface: "#234f53",
  fontUi: '"SluggersCezanne", Arial, sans-serif',
  fontDisplay: '"SluggersRodin", Arial, sans-serif',
  fontDetail: '"SluggersCezanne", Arial, sans-serif',
  textSize: "14px",
  lineHeight: "1.45",
  controlHeight: "36px",
  controlTextSize: "16px",
  buttonHeight: "36px",
  buttonTextSize: "14px",
  controlRadius: "6px",
  panelRadius: "12px",
  tableCellPadding: "10px 12px",
  tableHeader: "#3b64a8",
  tableSurface: "#3b64a8",
  tableContainerSurface: "transparent",
  tableTextSize: "14px",
  tableHeaderTextSize: "12px",
  space: "10px",
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

const displayTypography = {
  fontFamily: "var(--hui-font-display)",
  fontVariationSettings: "var(--hui-font-display-variation)",
  fontOpticalSizing: "var(--hui-font-display-optical-sizing)",
};
/** Short expressive headings/callouts, never a long-reading body default. */
export const displayStyles = css(displayTypography);

export const themeRoot = css({
  colorScheme: "var(--hui-color-scheme)",
  color: "var(--hui-ink)",
  backgroundColor: "var(--hui-canvas)",
  fontFamily: "var(--hui-font-ui)",
  fontSize: "var(--hui-text-size)",
  fontOpticalSizing: "auto",
  fontVariationSettings: "normal",
  "& h1, & h2, & h3": displayTypography,
  lineHeight: "var(--hui-line-height)",
  accentColor: "var(--hui-accent)",
  caretColor: "var(--hui-ink)",
  "& ::selection": {
    background: "var(--hui-accent)",
    color: "var(--hui-on-accent)",
  },
  "@media (prefers-reduced-motion: reduce)": { "--hui-motion": "0ms" },
});
