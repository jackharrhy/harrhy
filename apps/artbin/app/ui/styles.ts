import { css } from "remix/component";
import { brutalistTheme, themeRoot, themeStyles } from "@harrhy/ui/theme";
import {
  controlStyles,
  focusStyles,
  panelStyles,
  visuallyHiddenStyles,
} from "@harrhy/ui/recipes";

export const theme = {
  color: {
    background: "var(--hui-surface)",
    page: "var(--hui-canvas)",
    hover: "var(--hui-hover-surface)",
    subtle: "var(--hui-hover-surface)",
    text: "var(--hui-ink)",
    muted: "var(--hui-muted)",
    faint: "var(--hui-muted)",
    border: "var(--hui-button-border)",
    borderLight: "var(--hui-border)",
    danger: "var(--hui-danger)",
    success: "var(--hui-success)",
  },
  font: {
    body: "var(--hui-font-ui)",
    mono: "var(--hui-font-mono)",
  },
} as const;

export const documentStyle = [
  themeStyles(brutalistTheme),
  themeRoot,
  css({
    backgroundColor: theme.color.page,
    color: theme.color.text,
    fontFamily: theme.font.body,
    minHeight: "100%",
    "&, & *": { boxSizing: "border-box" },
    "& body": {
      backgroundColor: theme.color.page,
      color: theme.color.text,
      fontFamily: theme.font.body,
      margin: 0,
      minHeight: "100vh",
    },
    "& button, & input, & select, & textarea": { font: "inherit" },
    "& a": { color: theme.color.text, textDecoration: "underline" },
    "& a:hover": { color: "#000" },
    "& ::selection": {
      backgroundColor: theme.color.text,
      color: theme.color.background,
    },
    "& ::-webkit-scrollbar": { height: "8px", width: "8px" },
    "& ::-webkit-scrollbar-track": { background: theme.color.page },
    "& ::-webkit-scrollbar-thumb": { background: theme.color.borderLight },
    "& ::-webkit-scrollbar-thumb:hover": { background: theme.color.faint },
  }),
];

export const pageStyle = css({
  backgroundColor: theme.color.background,
  marginInline: "auto",
  maxWidth: "1400px",
  minHeight: "calc(100vh - 48px)",
  padding: "1rem",
});

export const narrowPageStyle = css({
  backgroundColor: theme.color.background,
  marginInline: "auto",
  maxWidth: "600px",
  minHeight: "calc(100vh - 48px)",
  padding: "1rem",
});

export const mutedTextStyle = css({ color: theme.color.muted });
export const dangerTextStyle = css({ color: theme.color.danger });
export const monoTextStyle = css({ fontFamily: theme.font.mono });

export const smallButtonStyle = css({
  fontSize: "0.75rem",
  padding: "0.25rem 0.5rem",
});

export const inputStyle = [controlStyles, focusStyles];

export const cardStyle = panelStyles;

export const alertStyle = css({
  border: `1px solid ${theme.color.borderLight}`,
  fontSize: "0.875rem",
  marginBottom: "1rem",
  padding: "0.75rem",
});

export const errorAlertStyle = css({
  background: "var(--hui-danger-surface)",
  borderColor: theme.color.danger,
});

export const successAlertStyle = css({
  background: "var(--hui-success-surface)",
  borderColor: theme.color.success,
});

export const adminBadgeStyle = css({
  background: theme.color.text,
  color: theme.color.background,
  fontSize: "0.625rem",
  letterSpacing: "0.05em",
  padding: "0.125rem 0.25rem",
  textTransform: "uppercase",
});

export const visuallyHiddenStyle = visuallyHiddenStyles;

export const modalCloseStyle = css({
  background: "none",
  border: "none",
  color: theme.color.muted,
  cursor: "pointer",
  fontSize: "1.5rem",
  lineHeight: 1,
  minWidth: "2.75rem",
  minHeight: "2.75rem",
  margin: "-0.5rem",
  padding: 0,
  "&:hover": { color: theme.color.text },
});

export const modalActionsStyle = css({
  display: "flex",
  gap: "0.5rem",
  marginTop: "1rem",
});
