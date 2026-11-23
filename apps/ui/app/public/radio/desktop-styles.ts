import { css } from "remix/component";

import { desktopColor } from "./theme.ts";

export const desktopControlStyle = {
  button: {
    boxSizing: "border-box",
    height: "30px",
    display: "inline-grid",
    placeItems: "center",
    padding: "0 10px",
    border: `1px solid ${desktopColor.ink}`,
    borderRadius: "3px",
    background: `linear-gradient(${desktopColor.paper}, ${desktopColor.wash})`,
    color: desktopColor.ink,
    boxShadow: "0 1px #fff inset",
    font: "inherit",
    lineHeight: 1,
    verticalAlign: "middle",
    cursor: "pointer",
    "&:focus-visible": {
      outline: `2px solid ${desktopColor.accent}`,
      outlineOffset: "2px",
    },
    "&:disabled": {
      opacity: 0.42,
      cursor: "not-allowed",
    },
  },
  range: {
    appearance: "none",
    height: "24px",
    background: "transparent",
    "&::-webkit-slider-runnable-track": {
      height: "14px",
      border: `1px solid ${desktopColor.line}`,
      borderRadius: "7px",
      background: `linear-gradient(180deg, ${desktopColor.stripe} 0%, ${desktopColor.paper} 48%, ${desktopColor.wash} 100%)`,
      boxShadow: "0 1px 2px rgba(31, 42, 49, 0.18) inset",
    },
    "&::-webkit-slider-thumb": {
      appearance: "none",
      width: "14px",
      height: "18px",
      marginTop: "-3px",
      border: `1px solid ${desktopColor.ink}`,
      borderRadius: "2px",
      background: `linear-gradient(${desktopColor.accentSoft}, ${desktopColor.accent})`,
    },
    "&::-moz-range-track": {
      height: "14px",
      border: `1px solid ${desktopColor.line}`,
      borderRadius: "7px",
      background: `linear-gradient(180deg, ${desktopColor.stripe} 0%, ${desktopColor.paper} 48%, ${desktopColor.wash} 100%)`,
      boxShadow: "0 1px 2px rgba(31, 42, 49, 0.18) inset",
    },
    "&::-moz-range-thumb": {
      width: "14px",
      height: "18px",
      border: `1px solid ${desktopColor.ink}`,
      borderRadius: "2px",
      background: `linear-gradient(${desktopColor.accentSoft}, ${desktopColor.accent})`,
    },
  },
} as const;

export const desktopSmallControlStyle = {
  ...desktopControlStyle.button,
  height: "24px",
  padding: "0 7px",
  fontSize: "12px",
} as const;

export const desktopIconStyle = {
  fontFamily: '"Material Symbols Rounded"',
  fontWeight: 400,
  fontStyle: "normal",
  lineHeight: 1,
  letterSpacing: "normal",
  textTransform: "none",
  whiteSpace: "nowrap",
  fontFeatureSettings: '"liga"',
} as const;

export const desktopStyle = {
  window: css({
    color: desktopColor.ink,
    background: `var(--radio-frame-image, ${desktopColor.wash})`,
    border: `1px solid ${desktopColor.ink}`,
    borderRadius: "var(--radio-frame-radius, var(--hui-panel-radius))",
    boxShadow: "var(--radio-frame-shadow, none)",
    overflow: "hidden",
    fontSize: "14px",
    lineHeight: "20px",
  }),
  titleBar: css({
    minHeight: "28px",
    display: "flex",
    alignItems: "center",
    padding: "0 8px",
    color: "var(--radio-title-ink, var(--hui-ink))",
    background: "var(--radio-title-bg, var(--hui-elevated))",
    borderBottom: `1px solid ${desktopColor.ink}`,
    textShadow: "var(--radio-title-shadow, none)",
  }),
  panel: css({
    background: desktopColor.paper,
    border: `1px solid ${desktopColor.line}`,
    boxShadow: "0 0 0 1px #fff inset",
  }),
  messageCard: css({
    background: desktopColor.paper,
    border: `1px solid ${desktopColor.line}`,
    boxShadow: "0 0 0 1px #fff inset",
    padding: "10px",
  }),
  messageLabel: css({
    display: "inline-grid",
    alignItems: "center",
    minWidth: "72px",
    minHeight: "23px",
    margin: "-1px 0 6px -1px",
    padding: "0 8px",
    background: desktopColor.accentSoft,
    border: `1px solid ${desktopColor.line}`,
    color: desktopColor.ink,
  }),
  primaryButton: css({
    ...desktopControlStyle.button,
    background: `linear-gradient(${desktopColor.accentSoft}, ${desktopColor.wash})`,
  }),
  smallButton: css(desktopSmallControlStyle),
  smallPrimaryButton: css({
    ...desktopSmallControlStyle,
    background: `linear-gradient(${desktopColor.accentSoft}, ${desktopColor.wash})`,
  }),
  input: css({
    width: "100%",
    minWidth: 0,
    height: "30px",
    border: `1px solid ${desktopColor.ink}`,
    borderRadius: "3px",
    background: desktopColor.paper,
    color: desktopColor.ink,
    padding: "0 8px",
    font: "inherit",
    "&:focus-visible": {
      outline: `2px solid ${desktopColor.accent}`,
      outlineOffset: "2px",
    },
  }),
  visuallyHidden: css({
    position: "absolute",
    width: "1px",
    height: "1px",
    opacity: 0,
    pointerEvents: "none",
  }),
} as const;
