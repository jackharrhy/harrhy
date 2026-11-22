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
    controls?: RemixNode;
    onThemeChange: (theme: ThemeName) => void;
  }>,
) {
  return () => {
    const { theme, page, controls, onThemeChange } = handle.props;
    return (
      <header mix={headerStyles}>
        <ButtonLink
          href={`/explorer?theme=${theme}`}
          variant="quiet"
          mix={brandStyles}
        >
          @harrhy/ui
        </ButtonLink>
        <nav aria-label="Workbench">
          <ButtonLink
            variant="quiet"
            href={`/explorer?theme=${theme}`}
            aria-current={page === "explorer" ? "page" : undefined}
          >
            <span>Explorer</span>
          </ButtonLink>
          <ButtonLink
            variant="quiet"
            href={`/scenes?theme=${theme}`}
            aria-current={page === "scenes" ? "page" : undefined}
          >
            <span>Scenes</span>
          </ButtonLink>
        </nav>
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
  display: "flex",
  alignItems: "center",
  zIndex: 5,
  "--workbench-picker-height": "32px",
  gap: "16px",
  fontSize: "var(--hui-text-size)",
  lineHeight: "var(--hui-line-height)",
  padding: "4px 24px",
  borderBottom: "1px solid var(--hui-border)",
  background: "var(--hui-surface)",
  "& nav": { display: "flex", gap: "4px" },
  '& nav [aria-current="page"] > span': {
    textDecoration: "underline",
    textUnderlineOffset: "6px",
  },
  "@media (max-width: 600px), (pointer: coarse)": {
    "--workbench-picker-height": "44px",
  },
  "@media (max-width: 600px)": {
    padding: "4px 16px",
    gap: "4px 8px",
    flexWrap: "wrap",
    "& nav": { order: 3, width: "100%" },
  },
});
const brandStyles = css({ fontWeight: 700, whiteSpace: "nowrap" });
const pickerStyles = css({
  marginLeft: "auto",
  gap: "8px",
  justifyContent: "flex-end",
  "& > div": { flexShrink: 0 },
  "& #workbench-theme": {
    width: "auto",
    minWidth: "100px",
    height: "var(--workbench-picker-height)",
    paddingBlock: "4px",
    fontSize: "0.875rem",
  },
});
