import { css } from "remix/component";

export const visuallyHiddenStyles = css({
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
});

export const focusStyles = css({
  "&:focus-visible": {
    outline: "2px solid var(--hui-focus)",
    outlineOffset: "3px",
  },
});

export const buttonStyles = css({
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  minHeight: "var(--hui-button-height)",
  padding: "var(--hui-button-padding)",
  border: "var(--hui-border-width) solid var(--hui-button-border)",
  borderRadius: "var(--hui-control-radius)",
  fontFamily: "var(--hui-font-ui)",
  fontVariationSettings: "normal",
  fontOpticalSizing: "auto",
  fontSize: "var(--hui-button-text-size)",
  fontWeight: "var(--hui-button-weight)",
  lineHeight: "1.25",
  backgroundColor: "var(--hui-surface)",
  backgroundImage: "var(--hui-button-image)",
  color: "var(--hui-ink)",
  boxShadow: "var(--hui-button-shadow)",
  textDecoration: "none",
  cursor: "pointer",
  textAlign: "center",
  transition: "filter var(--hui-motion)",
  '&[data-variant="primary"]': {
    borderColor: "var(--hui-button-primary-border)",
    backgroundColor: "var(--hui-accent)",
    color: "var(--hui-on-accent)",
  },
  '&[data-variant="danger"]': {
    backgroundColor: "var(--hui-danger)",
    color: "var(--hui-on-danger)",
    backgroundImage: "none",
  },
  '&[data-variant="quiet"]': {
    background: "transparent",
    borderColor: "transparent",
    boxShadow: "none",
  },
  "&:hover:not(:disabled):not([aria-disabled=true])": {
    filter: "brightness(0.94)",
  },
  "&:active:not(:disabled):not([aria-disabled=true])": {
    transform: "translateY(1px)",
    boxShadow: "none",
  },
  "&:disabled, &[aria-disabled=true]": {
    cursor: "not-allowed",
    boxShadow: "none",
    color: "var(--hui-muted)",
    backgroundColor: "var(--hui-disabled-surface)",
    backgroundImage: "none",
  },
});

export const controlStyles = css({
  boxSizing: "border-box",
  width: "100%",
  minWidth: "0",
  minHeight: "var(--hui-control-height)",
  padding: "var(--hui-control-padding)",
  border: "var(--hui-border-width) solid var(--hui-control-border)",
  borderRadius: "var(--hui-control-radius)",
  background: "var(--hui-surface)",
  color: "var(--hui-ink)",
  font: "inherit",
  fontFamily: "var(--hui-font-ui)",
  fontSize: "var(--hui-control-text-size)",
  lineHeight: "1.4",
  boxShadow: "var(--hui-control-shadow)",
  "&::placeholder": { color: "var(--hui-muted)", opacity: 1 },
  '&[aria-invalid="true"]': { borderColor: "var(--hui-danger)" },
  "&:disabled": {
    color: "var(--hui-muted)",
    backgroundColor: "var(--hui-disabled-surface)",
    backgroundImage: "none",
    cursor: "not-allowed",
  },
});
export const checkStyles = css({
  width: "1rem",
  height: "1rem",
  flexShrink: 0,
  margin: 0,
  verticalAlign: "middle",
  accentColor: "var(--hui-accent)",
});
export const fieldStyles = css({
  display: "grid",
  gap: "var(--hui-field-gap)",
  minWidth: "0",
});
export const labelStyles = css({
  fontFamily: "var(--hui-font-detail)",
  fontSize: "var(--hui-label-size)",
  fontWeight: "var(--hui-label-weight)",
  textTransform: "var(--hui-label-transform)",
  letterSpacing: "var(--hui-label-tracking)",
});
export const descriptionStyles = css({
  margin: 0,
  fontSize: "0.875rem",
  color: "var(--hui-muted)",
});
export const errorStyles = css({
  margin: 0,
  fontSize: "0.875rem",
  color: "var(--hui-danger)",
});
export const panelStyles = css({
  padding: "var(--hui-panel-padding)",
  border: "var(--hui-border-width) solid var(--hui-border)",
  borderRadius: "var(--hui-panel-radius)",
  backgroundColor: "var(--hui-surface)",
  backgroundImage: "var(--hui-panel-image)",
  minWidth: "0",
});
export const stackStyles = css({
  display: "flex",
  flexDirection: "column",
  gap: "var(--hui-space)",
});
export const inlineStyles = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--hui-space)",
});
export const noticeStyles = css({
  padding: "0.75rem 1rem",
  border: "var(--hui-border-width) solid var(--hui-border)",
  borderRadius: "var(--hui-control-radius)",
  background: "var(--hui-surface)",
  '&[data-tone="danger"]': {
    color: "var(--hui-danger)",
    background: "var(--hui-danger-surface)",
    borderColor: "currentColor",
  },
  '&[data-tone="success"]': {
    color: "var(--hui-success)",
    background: "var(--hui-success-surface)",
    borderColor: "currentColor",
  },
});
export const badgeStyles = css({
  fontFamily: "var(--hui-font-detail)",
  display: "inline-block",
  flex: "none",
  whiteSpace: "nowrap",
  padding: "0.125rem 0.5rem",
  fontSize: "0.8125rem",
  color: "var(--hui-muted)",
  border: "var(--hui-border-width) solid var(--hui-border)",
  borderRadius: "var(--hui-control-radius)",
});

export const rangeStyles = css({
  boxSizing: "border-box",
  minWidth: 0,
  minHeight: "24px",
  margin: 0,
  accentColor: "var(--hui-accent)",
  cursor: "pointer",
  "&:disabled": { cursor: "not-allowed", opacity: "0.65" },
});

/** Wrap Checkbox and label text; first-line alignment also works for multiline text. */
export const checkboxLabelStyles = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "0.625rem",
  minHeight: "24px",
  lineHeight: "24px",
  cursor: "pointer",
  "& input[type=checkbox]": { marginBlockStart: "4px" },
});
