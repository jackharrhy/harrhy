import { sluggersTheme as sluggersTokens, themeStyles } from "@harrhy/ui/theme";
import { css } from "remix/component";

export const sluggersTheme = themeStyles(sluggersTokens);
export const sheet = css({
  background: "transparent",
  color: "var(--hui-ink)",
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
  fontFamily: "var(--hui-font-display)",
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
  color: "var(--hui-muted)",
  margin: "8px 0",
  fontSize: "13px",
});
