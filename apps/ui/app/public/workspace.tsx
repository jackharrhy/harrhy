import { css, type Handle, type RemixNode } from "remix/component";
import { Button, Input } from "@harrhy/ui/native";
import { stories, type StoryId } from "./stories.ts";
import type { ThemeName } from "./themes.ts";

export const workbenchShell = css({
  height: "100dvh",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  overflow: "clip",
});
const split = css({
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr)",
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
  padding: "12px 16px 20px",
  fontSize: "14px",
  lineHeight: "1.5",
  borderRight: "1px solid var(--hui-border)",
  background: "var(--hui-surface)",
  "& form": { display: "flex", gap: "4px", marginBottom: "24px" },
  "& input": { minWidth: 0, width: "100%" },
  "& h2": {
    fontSize: "12px",
    color: "var(--hui-muted)",
    margin: "20px 10px 6px",
  },
  "& a": {
    display: "block",
    padding: "6px 10px",
    borderRadius: "var(--hui-control-radius)",
    textDecoration: "none",
    marginBottom: "2px",
    "&:hover": { background: "var(--hui-hover-surface)" },
  },
  '& a[aria-current="page"]': {
    background: "var(--hui-selected-surface)",
    color: "var(--hui-selected-ink)",
    fontWeight: 600,
  },
  "@media (max-width: 760px)": {
    padding: "0 16px",
    maxHeight: "38dvh",
    borderRight: 0,
    borderBottom: "1px solid var(--hui-border)",
    "& form": { marginBottom: "8px" },
    "& details[open]": { paddingBottom: "12px" },
  },
});
const mobile = css({
  display: "none",
  "@media (max-width: 760px)": {
    display: "block",
    "& summary": { cursor: "pointer", padding: "8px 0" },
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
const groups = [...new Set(stories.map((item) => item.group))];

export function WorkbenchWorkspace(
  handle: Handle<{
    theme: ThemeName;
    story?: StoryId;
    scene?: string;
    query?: string;
    children: RemixNode;
  }>,
) {
  return () => {
    const { theme, story, scene, query = "", children } = handle.props;
    const filtered = stories.filter((item) =>
      item.name.toLowerCase().includes(query.toLowerCase()),
    );
    const searchPath = `/explorer/${story ?? "button"}`;
    const items = () => (
      <>
        <nav aria-label="Scenes">
          <h2>Scenes</h2>
          {scenes.map(([id, name, path]) => (
            <a
              href={`${path}?theme=${theme}`}
              aria-current={scene === id ? "page" : undefined}
            >
              {name}
            </a>
          ))}
        </nav>
        <form method="get" action={searchPath}>
          <Input
            name="q"
            type="search"
            aria-label="Find a component"
            placeholder="Find a component…"
            defaultValue={query}
          />
          <Button type="submit">Find</Button>
          <input type="hidden" name="theme" value={theme} />
        </form>
        <nav aria-label="Component navigation">
          {groups.map((group) => {
            const matches = filtered.filter((item) => item.group === group);
            return (
              matches.length > 0 && (
                <div>
                  <h2>{group}</h2>
                  {matches.map((item) => (
                    <a
                      href={`/explorer/${item.id}?theme=${theme}&q=${encodeURIComponent(query)}`}
                      aria-current={item.id === story ? "page" : undefined}
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
              )
            );
          })}
        </nav>
        {filtered.length === 0 && (
          <p>
            No components found.{" "}
            <a href={`${searchPath}?theme=${theme}`}>Clear search</a>
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
