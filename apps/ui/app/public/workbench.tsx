import { css, type Handle, type RemixNode } from "remix/component";
import { ButtonLink, Inline } from "@harrhy/ui/native";
import { Select } from "@harrhy/ui/interactive";
import { themeOptions, type ThemeName } from "./themes.ts";

function setThemeUrl(theme: ThemeName) {
  const url = new URL(location.href);
  url.searchParams.set("theme", theme);
  history.replaceState(null, "", url);
}

export function WorkbenchHeader(
  handle: Handle<{
    theme: ThemeName;
    page: "explorer" | "scenes";
    title: string;
    controls?: RemixNode;
    onThemeChange: (theme: ThemeName) => void;
  }>,
) {
  return () => {
    const { theme, page, title, controls, onThemeChange } = handle.props;
    return (
      <header mix={headerStyles}>
        <div mix={brandCell}>
          <ButtonLink
            href={`/explorer?theme=${theme}`}
            variant="quiet"
            mix={brandStyles}
          >
            @harrhy/ui
          </ButtonLink>
        </div>
        <div mix={contextStyles} data-workbench-location>
          <span>{page === "scenes" ? "Scenes" : "Explorer"}</span>
          <span aria-hidden="true">/</span>
          <strong>{title}</strong>
        </div>
        <Inline mix={pickerStyles}>
          <Select
            id="workbench-theme"
            aria-label="Theme"
            defaultValue={theme}
            options={themeOptions}
            onValueChange={(value) => {
              const next = value as ThemeName;
              setThemeUrl(next);
              onThemeChange(next);
            }}
          />
          {controls}
        </Inline>
      </header>
    );
  };
}
const headerStyles = css({
  display: "grid",
  gridTemplateColumns: "var(--workbench-rail-width) minmax(0, 1fr) auto",
  alignItems: "center",
  zIndex: 5,
  "--workbench-picker-height": "32px",
  fontSize: "var(--hui-text-size)",
  lineHeight: "var(--hui-line-height)",
  paddingRight: "16px",
  borderBottom: "1px solid var(--hui-border)",
  background: "var(--hui-surface)",
  "@media (max-width: 760px), (pointer: coarse)": {
    "--workbench-picker-height": "44px",
  },
  "@media (max-width: 760px)": {
    gridTemplateColumns: "minmax(0, 1fr) auto",
    padding: "0 12px",
  },
});
const brandCell = css({
  padding: "4px 16px",
  alignSelf: "stretch",
  display: "flex",
  alignItems: "center",
  borderRight: "1px solid var(--hui-border)",
  "@media (max-width: 760px)": { borderRight: 0, padding: "4px 0" },
});
const brandStyles = css({
  fontFamily: "var(--hui-font-mono)",
  fontSize: "0.875rem",
  fontWeight: 650,
  whiteSpace: "nowrap",
});
const contextStyles = css({
  display: "flex",
  alignItems: "baseline",
  gap: "8px",
  minWidth: 0,
  paddingInline: "16px",
  fontSize: "0.875rem",
  color: "var(--hui-muted)",
  "& strong": {
    fontWeight: 650,
    color: "var(--hui-ink)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  "@media (max-width: 760px)": { display: "none" },
});
const pickerStyles = css({
  paddingBlock: "4px",
  gap: "8px",
  justifyContent: "flex-end",
  "& > div": { flexShrink: 0 },
  "& #workbench-theme": {
    width: "auto",
    minWidth: "100px",
    height: "var(--workbench-picker-height)",
    paddingBlock: "4px",
    fontSize: "0.875rem",
    "&::before": {
      content: '""',
      width: "9px",
      height: "9px",
      flex: "none",
      borderRadius: "2px",
      background: "var(--hui-accent)",
    },
    "& > span": { marginRight: "auto" },
  },
  "@media (max-width: 760px)": { maxWidth: "min(60vw, 240px)" },
});
