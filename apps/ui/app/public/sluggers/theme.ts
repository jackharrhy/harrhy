import { css } from "remix/component";

export const sheet = css({
  background: "transparent",
  color: "var(--hui-ink)",
  padding: "0",
  borderRadius: "0",
  minWidth: 0,
  "@media(max-width: 37.5rem)": { padding: "0" },
});
export const columns = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(15rem, 1fr)",
  gap: "1.25rem",
  alignItems: "start",
  "@media(max-width: 53.125rem)": { gridTemplateColumns: "minmax(0, 1fr)" },
});
export const number = css({
  fontFamily: "var(--hui-font-display)",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
  whiteSpace: "nowrap",
});
export const heading = css({
  margin: "0 0 0.5rem",
  fontSize: "1.5rem",
  lineHeight: "1.3",
});
export const quiet = css({
  color: "var(--hui-muted)",
  margin: "0.5rem 0",
  fontSize: "0.8125rem",
});
