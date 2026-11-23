import { css } from "remix/component";
import { tokens } from "./theme.ts";

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
    outline: `2px solid ${tokens.focus}`,
    outlineOffset: "3px",
  },
});

export const buttonStyles = css({
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  minHeight: tokens.button.height,
  padding: tokens.button.padding,
  border: `${tokens.borderWidth} solid ${tokens.button.border}`,
  borderRadius: tokens.control.radius,
  fontFamily: tokens.font.ui,
  fontVariationSettings: "normal",
  fontOpticalSizing: "auto",
  fontSize: tokens.button.textSize,
  fontWeight: tokens.button.weight,
  lineHeight: "1.25",
  backgroundColor: tokens.surface,
  backgroundImage: tokens.button.image,
  color: tokens.ink,
  boxShadow: tokens.button.shadow,
  textDecoration: "none",
  cursor: "pointer",
  textAlign: "center",
  transition: `filter ${tokens.motion}`,
  '&[data-variant="primary"]': {
    borderColor: tokens.button.primaryBorder,
    backgroundColor: tokens.accent,
    color: tokens.onAccent,
  },
  '&[data-variant="danger"]': {
    backgroundColor: tokens.danger,
    color: tokens.onDanger,
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
    color: tokens.muted,
    backgroundColor: tokens.disabledSurface,
    backgroundImage: "none",
  },
});

export const controlStyles = css({
  boxSizing: "border-box",
  width: "100%",
  minWidth: "0",
  minHeight: tokens.control.height,
  padding: tokens.control.padding,
  border: `${tokens.borderWidth} solid ${tokens.control.border}`,
  borderRadius: tokens.control.radius,
  background: tokens.surface,
  color: tokens.ink,
  font: "inherit",
  fontFamily: tokens.font.ui,
  fontSize: tokens.control.textSize,
  lineHeight: "1.4",
  boxShadow: tokens.control.shadow,
  "&::placeholder": { color: tokens.muted, opacity: 1 },
  '&[aria-invalid="true"]': { borderColor: tokens.danger },
  "&:disabled": {
    color: tokens.muted,
    backgroundColor: tokens.disabledSurface,
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
  accentColor: tokens.accent,
});
export const fieldStyles = css({
  display: "grid",
  gap: tokens.field.gap,
  minWidth: "0",
});
export const labelStyles = css({
  fontFamily: tokens.font.detail,
  fontSize: tokens.label.size,
  fontWeight: tokens.label.weight,
  textTransform: tokens.label.transform,
  letterSpacing: tokens.label.tracking,
});
export const descriptionStyles = css({
  margin: 0,
  fontSize: "0.875rem",
  color: tokens.muted,
});
export const errorStyles = css({
  margin: 0,
  fontSize: "0.875rem",
  color: tokens.danger,
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
