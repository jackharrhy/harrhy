import { css, type Handle } from "remix/component";
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
    onThemeChange: (theme: ThemeName) => void;
  }>,
) {
  return () => {
    const { theme, page, onThemeChange } = handle.props;
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
          <label htmlFor="workbench-theme">Theme</label>
          <Select
            id="workbench-theme"
            defaultValue={theme}
            options={themeOptions}
            onValueChange={(value) => {
              const next = value as ThemeName;
              setThemeUrl(next);
              onThemeChange(next);
            }}
          />
        </Inline>
      </header>
    );
  };
}
const headerStyles = css({
  display: "flex",
  alignItems: "center",
  gap: "24px",
  minHeight: "72px",
  fontSize: "var(--hui-text-size)",
  lineHeight: "var(--hui-line-height)",
  padding: "12px 24px",
  borderBottom: "1px solid var(--hui-border)",
  background: "var(--hui-surface)",
  "& nav": { display: "flex", gap: "4px" },
  '& nav [aria-current="page"] > span': {
    textDecoration: "underline",
    textUnderlineOffset: "6px",
  },
  "@media (max-width: 600px)": {
    padding: "12px 16px",
    gap: "8px",
    flexWrap: "wrap",
    "& nav": { order: 3, width: "100%" },
  },
});
const brandStyles = css({ fontWeight: 700, whiteSpace: "nowrap" });
const pickerStyles = css({
  marginLeft: "auto",
  gap: "8px",
  flexWrap: "nowrap",
  "& button": { width: "auto", minWidth: "100px" },
  "& label": { fontSize: "0.875rem", color: "var(--hui-muted)" },
});
