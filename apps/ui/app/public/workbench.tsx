import { css, type Handle } from "remix/component";
import { ButtonLink, Inline } from "@harrhy/ui/native";
import { Select } from "@harrhy/ui/interactive";
import {
  densityOptions,
  themeOptions,
  themes,
  type Density,
  type ThemeName,
} from "./themes.ts";

function setPreference(key: string, value: string) {
  const url = new URL(location.href);
  url.searchParams.set(key, value);
  history.replaceState(null, "", url);
}

export function WorkbenchHeader(
  handle: Handle<{
    theme: ThemeName;
    page: "explorer" | "scenes";
    title: string;
    density: Density;
    onDensityChange: (density: Density) => void;
    onThemeChange: (theme: ThemeName) => void;
  }>,
) {
  return () => {
    const { theme, page, title, density, onDensityChange, onThemeChange } =
      handle.props;
    return (
      <header mix={headerStyles}>
        <div mix={brandCell}>
          <ButtonLink
            href={`/explorer?theme=${theme}&density=${density}`}
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
            optionLabelMix={(option) => optionFonts[option.value as ThemeName]}
            onValueChange={(value) => {
              const next = value as ThemeName;
              setPreference("theme", next);
              onThemeChange(next);
            }}
          />
          <Select
            id="workbench-density"
            aria-label="Density"
            defaultValue={density}
            options={densityOptions}
            onValueChange={(value) => {
              const next = value === "compact" ? "compact" : "standard";
              setPreference("density", next);
              onDensityChange(next);
            }}
          />
        </Inline>
      </header>
    );
  };
}
const optionFonts = Object.fromEntries(
  Object.entries(themes).map(([id, theme]) => [
    id,
    [
      css({
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        "&::before": {
          content: '""',
          width: "0.5625rem",
          height: "0.5625rem",
          borderRadius: "0.125rem",
          background: theme.accent,
        },
        fontFamily:
          theme.fontDisplay === "var(--hui-font-ui)"
            ? theme.fontUi
            : theme.fontDisplay,
        fontVariationSettings: theme.fontDisplayVariation,
        fontOpticalSizing:
          theme.fontDisplayOpticalSizing === "none" ? "none" : "auto",
      }),
    ],
  ]),
) as Record<ThemeName, ReturnType<typeof css>[]>;

const headerStyles = css({
  display: "grid",
  gridTemplateColumns: "var(--workbench-rail-width) minmax(0, 1fr) auto",
  alignItems: "center",
  zIndex: 5,
  "--workbench-picker-height": "2rem",
  fontSize: "var(--hui-text-size)",
  lineHeight: "var(--hui-line-height)",
  paddingRight: "1rem",
  borderBottom: "1px solid var(--hui-border)",
  background: "var(--hui-surface)",
  "@media (max-width: 47.5rem), (pointer: coarse)": {
    "--workbench-picker-height": "2.75rem",
  },
  "@media (max-width: 47.5rem)": {
    gridTemplateColumns: "minmax(0, 1fr) auto",
    padding: "0 0.75rem",
  },
});
const brandCell = css({
  padding: "0.25rem 1rem",
  alignSelf: "stretch",
  display: "flex",
  alignItems: "center",
  borderRight: "1px solid var(--hui-border)",
  "@media (max-width: 47.5rem)": { borderRight: 0, padding: "0.25rem 0" },
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
  gap: "0.5rem",
  minWidth: 0,
  paddingInline: "1rem",
  fontSize: "0.875rem",
  color: "var(--hui-muted)",
  "& strong": {
    fontWeight: 650,
    color: "var(--hui-ink)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  "@media (max-width: 47.5rem)": { display: "none" },
});
const pickerStyles = css({
  flexWrap: "nowrap",
  paddingBlock: "0.25rem",
  gap: "0.5rem",
  justifyContent: "flex-end",
  "& > div": { flexShrink: 0 },
  "& #workbench-density, & #workbench-theme": {
    width: "auto",
    height: "var(--workbench-picker-height)",
    paddingBlock: "0.25rem",
    fontSize: "0.875rem",
  },
  "& #workbench-theme": {
    width: "auto",
    minWidth: "6.25rem",
    "&::before": {
      content: '""',
      width: "0.5625rem",
      height: "0.5625rem",
      flex: "none",
      borderRadius: "0.125rem",
      background: "var(--hui-accent)",
    },
    "& > span": { marginRight: "auto" },
  },
  "@media (max-width: 47.5rem)": {
    gap: "0.25rem",
    "& button": { paddingInline: "0.375rem" },
  },
});
