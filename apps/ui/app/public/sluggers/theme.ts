import { cleanTheme, composeTheme, themeStyles } from "@harrhy/ui/theme";
import { css } from "remix/component";

export const sluggersTheme = themeStyles(
  composeTheme(cleanTheme, {
    canvas: "#16418a",
    surface: "#ffffff",
    elevated: "#ffffff",
    ink: "#17243b",
    muted: "#526079",
    border: "#c4cfdf",
    controlBorder: "#74829a",
    accent: "#174ca1",
    onAccent: "#ffffff",
    focus: "#a43a00",
    fontUi: "SluggersCezanne, system-ui, sans-serif",
    fontDisplay: "SluggersBolt, system-ui, sans-serif",
    fontDetail: "SluggersCezanne, system-ui, sans-serif",
    textSize: "14px",
    lineHeight: "1.6",
    controlHeight: "40px",
    buttonHeight: "40px",
    controlRadius: "6px",
    panelRadius: "12px",
    tableCellPadding: "12px 14px",
    tableHeader: "#edf2f8",
    tableTextSize: "14px",
  }),
);
export const sheet = css({
  background: "#fff",
  color: "#17243b",
  padding: "24px",
  borderRadius: "12px",
  minWidth: 0,
  "@media(max-width: 600px)": { padding: "16px" },
});
export const columns = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(240px, 1fr)",
  gap: "24px",
  alignItems: "start",
  "@media(max-width: 850px)": { gridTemplateColumns: "minmax(0, 1fr)" },
});
export const number = css({
  fontFamily: "SluggersRodin, system-ui, sans-serif",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
});
export const heading = css({
  margin: "0 0 16px",
  fontSize: "24px",
  lineHeight: "1.3",
});
export const quiet = css({
  color: "#526079",
  margin: "8px 0",
  fontSize: "13px",
});
