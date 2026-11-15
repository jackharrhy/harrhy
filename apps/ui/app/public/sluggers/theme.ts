import { cleanTheme, composeTheme, themeStyles } from "@harrhy/ui/theme";
import { css } from "remix/component";

export const sluggersTheme = themeStyles(
  composeTheme(cleanTheme, {
    canvas: "oklch(48.197% 0.17551 261.35)",
    surface: "#304f8b",
    elevated: "#294578",
    ink: "#ffffff",
    muted: "#d6e3fa",
    border: "rgb(180 203 241 / 0.28)",
    controlBorder: "#93add5",
    accent: "#fff1a1",
    onAccent: "#173866",
    focus: "#ffe77d",
    fontUi: "SluggersCezanne, system-ui, sans-serif",
    fontDisplay: "SluggersRodin, system-ui, sans-serif",
    fontDetail: "SluggersCezanne, system-ui, sans-serif",
    textSize: "14px",
    lineHeight: "1.45",
    controlHeight: "36px",
    buttonHeight: "36px",
    controlRadius: "6px",
    panelRadius: "12px",
    tableCellPadding: "10px 12px",
    tableHeader: "rgb(106 130 174 / 0.3)",
    tableSurface: "transparent",
    hoverSurface: "rgb(142 170 215 / 0.2)",
    selectedSurface: "#48699f",
    selectedInk: "#ffffff",
    disabledSurface: "#304b79",
    danger: "#ffc1c6",
    dangerSurface: "#58374d",
    success: "#a6f0c2",
    successSurface: "#234f53",
    space: "10px",
    tableTextSize: "14px",
  }),
);
export const sheet = css({
  background: "transparent",
  color: "#fff",
  padding: "0",
  borderRadius: "0",
  minWidth: 0,
  "@media(max-width: 600px)": { padding: "0" },
});
export const columns = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(240px, 1fr)",
  gap: "20px",
  alignItems: "start",
  "@media(max-width: 850px)": { gridTemplateColumns: "minmax(0, 1fr)" },
});
export const number = css({
  fontFamily: "SluggersRodin, system-ui, sans-serif",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
  whiteSpace: "nowrap",
});
export const heading = css({
  margin: "0 0 8px",
  fontSize: "24px",
  lineHeight: "1.3",
});
export const quiet = css({
  color: "#d6e3fa",
  margin: "8px 0",
  fontSize: "13px",
});
