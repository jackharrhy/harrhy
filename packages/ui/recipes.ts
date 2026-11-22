import { css } from "remix/component";
import { themeVar } from "./theme.ts";

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
    outline: `2px solid ${themeVar.focus}`,
    outlineOffset: "3px",
  },
});

export const buttonStyles = css({
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  minHeight: themeVar.buttonHeight,
  padding: themeVar.buttonPadding,
  border: `${themeVar.borderWidth} solid ${themeVar.buttonBorder}`,
  borderRadius: themeVar.controlRadius,
  fontFamily: themeVar.fontUi,
  fontVariationSettings: "normal",
  fontOpticalSizing: "auto",
  fontSize: themeVar.buttonTextSize,
  fontWeight: themeVar.buttonWeight,
  lineHeight: "1.25",
  backgroundColor: themeVar.surface,
  backgroundImage: themeVar.buttonImage,
  color: themeVar.ink,
  boxShadow: themeVar.buttonShadow,
  textDecoration: "none",
  cursor: "pointer",
  textAlign: "center",
  transition: `filter ${themeVar.motion}`,
  '&[data-variant="primary"]': {
    borderColor: themeVar.buttonPrimaryBorder,
    backgroundColor: themeVar.accent,
    color: themeVar.onAccent,
  },
  '&[data-variant="danger"]': {
    backgroundColor: themeVar.danger,
    color: themeVar.onDanger,
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
    color: themeVar.muted,
    backgroundColor: themeVar.disabledSurface,
    backgroundImage: "none",
  },
});

export const controlStyles = css({
  boxSizing: "border-box",
  width: "100%",
  minWidth: "0",
  minHeight: themeVar.controlHeight,
  padding: themeVar.controlPadding,
  border: `${themeVar.borderWidth} solid ${themeVar.controlBorder}`,
  borderRadius: themeVar.controlRadius,
  background: themeVar.surface,
  color: themeVar.ink,
  font: "inherit",
  fontFamily: themeVar.fontUi,
  fontSize: themeVar.controlTextSize,
  lineHeight: "1.4",
  boxShadow: themeVar.controlShadow,
  "&::placeholder": { color: themeVar.muted, opacity: 1 },
  '&[aria-invalid="true"]': { borderColor: themeVar.danger },
  "&:disabled": {
    color: themeVar.muted,
    backgroundColor: themeVar.disabledSurface,
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
  accentColor: themeVar.accent,
});
export const fieldStyles = css({
  display: "grid",
  gap: themeVar.fieldGap,
  minWidth: "0",
});
export const labelStyles = css({
  fontFamily: themeVar.fontDetail,
  fontSize: themeVar.labelSize,
  fontWeight: themeVar.labelWeight,
  textTransform: themeVar.labelTransform,
  letterSpacing: themeVar.labelTracking,
});
export const descriptionStyles = css({
  margin: 0,
  fontSize: "0.875rem",
  color: themeVar.muted,
});
export const errorStyles = css({
  margin: 0,
  fontSize: "0.875rem",
  color: themeVar.danger,
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

/** Shared route/tab presentation; callers retain their own link or widget semantics. */
export const navigationStripStyles = css({
  display: "flex",
  gap: 0,
  overflowX: "auto",
  borderBottom: "1px solid var(--hui-border)",
});
export const navigationItemStyles = css({
  flexShrink: 0,
  minHeight: "var(--hui-control-height)",
  padding: "0.5rem 1rem",
  fontFamily: "var(--hui-font-ui)",
  fontSize: "0.875rem",
  lineHeight: 1.25,
  border: 0,
  borderBottom: "2px solid transparent",
  background: "transparent",
  color: "var(--hui-muted)",
  textDecoration: "none",
  cursor: "pointer",
  "&:hover": { color: "var(--hui-ink)" },
  "&[aria-current=page], &[aria-selected=true]": {
    borderBottomColor: "var(--hui-ink)",
    color: "var(--hui-ink)",
    fontWeight: 600,
  },
  "&:disabled": { color: "var(--hui-muted)", cursor: "not-allowed" },
});

/** Pixel distance consumed by upstream anchor positioning, including collision flipping. */
export function popupOffset(floating: HTMLElement): number {
  const value = Number.parseFloat(
    getComputedStyle(floating).getPropertyValue("--hui-popup-offset"),
  );
  return Number.isFinite(value) && value >= 0 ? value : 6;
}
