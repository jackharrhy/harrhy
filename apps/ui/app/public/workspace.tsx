import { css, type Handle, type RemixNode } from "remix/component";
import { Button, ButtonLink, Input } from "@harrhy/ui/native";
import { stories, type StoryId } from "./stories.ts";
import type { Density, ThemeName } from "./themes.ts";

export const workbenchShell = css({
  height: "100dvh",
  "--workbench-rail-width": "220px",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  overflow: "clip",
});
const split = css({
  display: "grid",
  gridTemplateColumns: "var(--workbench-rail-width) minmax(0, 1fr)",
  gridTemplateRows: "minmax(0, 1fr)",
  "@media (max-width: 760px)": {
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "auto minmax(0, 1fr)",
  },
});
const scrollPane = css({
  minHeight: 0,
  minWidth: 0,
  overflow: "auto",
  overscrollBehavior: "contain",
  "&:focus-visible": {
    outline: "2px solid var(--hui-focus)",
    outlineOffset: "-2px",
  },
});
const rail = css({
  fontSize: "14px",
  lineHeight: "1.5",
  borderRight: "1px solid var(--hui-border)",
  background: "var(--hui-surface)",
  scrollPaddingTop: "64px",
  "& nav": { padding: "8px 10px" },
  "& nav + nav": { borderTop: "1px solid var(--hui-border)" },
  "& h2": {
    fontSize: "11px",
    fontWeight: 650,
    letterSpacing: "0.055em",
    textTransform: "uppercase",
    color: "var(--hui-muted)",
    margin: "8px 8px 4px",
  },
  "& nav div + div": { marginTop: "12px" },
  "& a[data-example-link]": {
    display: "flex",
    justifyContent: "flex-start",
    width: "100%",
    minHeight: "32px",
    padding: "4px 8px",
    borderColor: "transparent",
    fontSize: "inherit",
    fontWeight: 500,
    textDecoration: "none",
    "&:hover": { background: "var(--hui-hover-surface)" },
  },
  "& a[data-example-link][aria-current=page]": {
    background: "var(--hui-selected-surface)",
    color: "var(--hui-selected-ink)",
    fontWeight: 650,
  },
  "& a[data-example-link][aria-current=page]::after": {
    content: '""',
    marginLeft: "auto",
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    background: "currentColor",
  },
  "@media (max-width: 760px)": {
    maxHeight: "38dvh",
    borderRight: 0,
    borderBottom: "1px solid var(--hui-border)",
    "& a[data-example-link]": { minHeight: "40px" },
    "& details[open]": { paddingBottom: "12px" },
  },
});
const search = css({
  position: "sticky",
  top: 0,
  zIndex: 1,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  padding: "10px",
  background: "var(--hui-surface)",
  borderBottom: "1px solid var(--hui-border)",
  "& input": {
    gridArea: "1 / 1 / 2 / 3",
    width: "100%",
    minWidth: 0,
    paddingInlineEnd: "40px",
    fontSize: "inherit",
  },
  "& button": {
    gridArea: "1 / 2",
    zIndex: 1,
    marginInlineEnd: "2px",
    minHeight: "28px",
    minWidth: "32px",
    padding: "4px",
    color: "var(--hui-muted)",
  },
});
const empty = css({
  padding: "0 18px 16px",
  color: "var(--hui-muted)",
  "& a": { color: "inherit" },
});

const mobile = css({
  display: "none",
  "@media (max-width: 760px)": {
    display: "block",
    "& summary": { cursor: "pointer", padding: "8px 16px" },
  },
});

const desktop = css({
  "@media (max-width: 760px)": { display: "none" },
});
const scenes = [
  ["forms", "Forms", "/scenes"],
  ["radio", "Radio", "/scenes/radio"],
  ["sluggers", "Sluggers", "/scenes/sluggers"],
  ["themes", "Themes", "/scenes/themes"],
  ["clank", "Clank cook-off", "/scenes/clank"],
] as const;
export function sceneLabel(id: string) {
  return scenes.find(([key]) => key === id)?.[1] ?? "Forms";
}
const groups = [...new Set(stories.map((item) => item.group))];

export function WorkbenchWorkspace(
  handle: Handle<{
    theme: ThemeName;
    density: Density;
    story?: StoryId;
    scene?: string;
    query?: string;
    children: RemixNode;
  }>,
) {
  return () => {
    const { theme, density, story, scene, query = "", children } = handle.props;
    const filtered = stories.filter((item) =>
      item.name.toLowerCase().includes(query.toLowerCase()),
    );
    const searchPath = `/explorer/${story ?? "button"}`;
    const items = () => (
      <>
        <form role="search" mix={search} method="get" action={searchPath}>
          <Input
            name="q"
            type="search"
            aria-label="Find a component"
            placeholder="Find a component"
            defaultValue={query}
          />
          <Button type="submit" variant="quiet" aria-label="Find">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            >
              <circle cx="7" cy="7" r="4" />
              <path d="m10 10 3.5 3.5" />
            </svg>
          </Button>
          <input type="hidden" name="theme" value={theme} />
          <input type="hidden" name="density" value={density} />
        </form>
        <nav aria-label="Scenes">
          <h2>Scenes</h2>
          {scenes.map(([id, name, path]) => (
            <ButtonLink
              variant="quiet"
              data-example-link
              href={`${path}?theme=${theme}&density=${density}`}
              aria-current={scene === id ? "page" : undefined}
            >
              {name}
            </ButtonLink>
          ))}
        </nav>
        <nav aria-label="Component navigation">
          {groups.map((group) => {
            const matches = filtered.filter((item) => item.group === group);
            return (
              matches.length > 0 && (
                <div>
                  <h2>{group}</h2>
                  {matches.map((item) => (
                    <ButtonLink
                      variant="quiet"
                      data-example-link
                      href={`/explorer/${item.id}?theme=${theme}&density=${density}&q=${encodeURIComponent(query)}`}
                      aria-current={item.id === story ? "page" : undefined}
                    >
                      {item.name}
                    </ButtonLink>
                  ))}
                </div>
              )
            );
          })}
        </nav>
        {filtered.length === 0 && (
          <p mix={empty}>
            No components found.{" "}
            <a href={`${searchPath}?theme=${theme}&density=${density}`}>
              Clear search
            </a>
          </p>
        )}
      </>
    );
    const selected =
      stories.find((item) => item.id === story)?.name ??
      scenes.find(([id]) => id === scene)?.[1];
    return (
      <div mix={split}>
        <aside mix={[scrollPane, rail]} aria-label="Examples" tabindex={0}>
          <div mix={desktop}>{items()}</div>
          <details mix={mobile} open={query ? true : undefined}>
            <summary>Browse examples{selected ? `: ${selected}` : ""}</summary>
            {items()}
          </details>
        </aside>
        <div
          mix={scrollPane}
          data-workbench-content
          role="region"
          aria-label="Example preview"
          tabindex={0}
        >
          {children}
        </div>
      </div>
    );
  };
}
