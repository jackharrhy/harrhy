import { css, unsafeHTML } from "remix/component";
import type { RemixNode } from "remix/component";
import { Button, Notice } from "@harrhy/ui/native";
import { themeRoot } from "@harrhy/ui/theme";
import { controlStyles, focusStyles } from "@harrhy/ui/recipes";
import { themes, themeMixins, type ThemeId } from "./theme.ts";
import { spaces, spacePath } from "./spaces.ts";

const documentStyles = css({
  colorScheme: "light",
  fontFamily: "var(--hui-font-ui)",
  fontSize: "18px",
  lineHeight: 1.65,
  color: "var(--hui-ink)",
  background: "var(--hui-canvas)",
  "& *": { boxSizing: "border-box" },
  "& body": { margin: 0 },
  "& main": {
    maxWidth: "72ch",
    margin: "2.5rem auto 5rem",
    padding: "0 1.25rem",
    overflowWrap: "anywhere",
  },
  "& h1, & h2, & h3": { lineHeight: 1.25 },
  "& h1": { fontSize: "1.9rem", margin: "0 0 1.25rem" },
  "& h2": { fontSize: "1.35rem", margin: "2rem 0 .75rem" },
  "& h3": { fontSize: "1.1rem", margin: "1.5rem 0 .5rem" },
  "& p": { margin: "0 0 1rem" },
  "& a": { color: "var(--hui-ink)", textUnderlineOffset: ".12em" },
  "& a:visited": { color: "var(--hui-ink)" },
  "& a:hover": { textDecorationThickness: "2px" },
  "& :focus-visible": {
    outline: "2px solid var(--hui-focus)",
    outlineOffset: "4px",
  },
  "& ::selection": {
    background: "var(--hui-selected-surface)",
    color: "var(--hui-ink)",
  },
  "& ul, & ol": { paddingLeft: "1.5rem" },
  "& li": { margin: ".25rem 0" },
  "& li > ul": { marginBlock: ".25rem .75rem" },
  "& small": { fontSize: ".85rem" },
  "& details": { margin: "1.5rem 0" },
  "& summary": {
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: ".15em",
  },
  "& details[open] > summary": { marginBottom: ".75rem" },
  "& blockquote": {
    borderLeft: "2px solid var(--hui-border)",
    marginInline: 0,
    paddingLeft: "1rem",
  },
  "& code": {
    fontFamily: "var(--hui-font-mono)",
    fontSize: ".82em",
  },
  "& pre": {
    maxWidth: "100%",
    overflowX: "auto",
    padding: "1rem",
    border: "1px solid var(--hui-border)",
    lineHeight: 1.6,
    tabSize: 2,
  },
  "& .atlas-table": {
    width: "min(76rem, calc(100vw - 2.5rem))",
    marginInline: "calc((100% - min(76rem, 100vw - 2.5rem)) / 2)",
    overflowX: "auto",
    marginBlock: "1.5rem",
  },
  "& table": {
    width: "max-content",
    minWidth: "100%",
    overflowWrap: "normal",
    borderCollapse: "collapse",
  },
  "& th, & td": {
    minWidth: "8rem",
    maxWidth: "32rem",
    padding: ".35rem .75rem .35rem 0",
    verticalAlign: "top",
    borderBottom: "1px solid var(--hui-border)",
  },
  "& input, & button": {
    font: "inherit",
    maxWidth: "100%",
    padding: ".3rem .5rem",
    caretColor: "var(--hui-accent)",
  },
  "@media (max-width: 520px)": {
    "& main": { marginTop: "1.5rem" },
    "& h1": { fontSize: "1.7rem" },
  },
});
const skipStyles = css({
  position: "fixed",
  top: "-5rem",
  left: "1rem",
  background: "var(--hui-surface)",
  padding: ".5rem",
  "&:focus": { top: ".5rem" },
});

const headerStyles = css({
  maxWidth: "76rem",
  margin: "0 auto",
  padding: ".25rem 1.25rem",
  display: "flex",
  alignItems: "flex-start",
  gap: ".75rem",
  borderBottom: "1px solid var(--hui-border)",
  "& nav": {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: "0 1rem",
  },
  "& nav a": {
    minHeight: "2.75rem",
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
    borderBottom: "2px solid transparent",
    fontSize: ".8rem",
  },
  '& nav a[aria-current="page"]': {
    fontWeight: "700",
    borderBottomColor: "var(--hui-ink)",
  },
  "& nav a:hover": { textDecoration: "underline" },
});
const settingsStyles = css({
  position: "fixed",
  inset: "3.5rem 1.25rem auto auto",
  margin: 0,
  maxWidth: "calc(100vw - 2.5rem)",
  padding: "1rem",
  color: "var(--hui-ink)",
  background: "var(--hui-surface)",
  border: "1px solid var(--hui-control-border)",
  borderRadius: "var(--hui-panel-radius)",
  "& form": {
    display: "flex",
    alignItems: "center",
    gap: ".6rem",
    flexWrap: "wrap",
    fontSize: ".8rem",
  },
});
export interface DocumentOptions {
  stale?: boolean;
  theme: ThemeId;
  url: URL;
  available: readonly { id: string; count: number }[];
}
export function document(
  title: string,
  body: RemixNode,
  options: DocumentOptions,
) {
  const active = spaces.find((space) =>
    options.url.pathname.startsWith(`${spacePath(space.id)}/`),
  );
  return (
    <html
      lang="en"
      data-theme={options.theme}
      mix={[themeMixins[options.theme], themeRoot, documentStyles]}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{title}</title>
        {options.theme === "brutalist" && (
          <link rel="stylesheet" href="/fonts.css" />
        )}
      </head>
      <body>
        <a mix={skipStyles} href="#main">
          Skip to content
        </a>
        <header mix={headerStyles}>
          <nav aria-label="Agent spaces">
            <a href="/" aria-current={!active ? "page" : undefined}>
              All spaces
            </a>
            {spaces.map((space) => (
              <a
                href={`${spacePath(space.id)}/`}
                aria-current={active?.id === space.id ? "page" : undefined}
                title={`${options.available.find((entry) => entry.id === space.id)?.count ?? 0} pages`}
              >
                {space.name}
              </a>
            ))}
          </nav>
          <Button
            type="button"
            aria-label="Settings"
            popoverTarget="settings"
            mix={css({
              width: "2.75rem",
              minWidth: "2.75rem",
              height: "2.75rem",
              padding: 0,
              fontSize: "1.25rem",
            })}
          >
            <span aria-hidden="true">⚙</span>
          </Button>
          <div
            id="settings"
            popover="auto"
            aria-label="Settings"
            mix={settingsStyles}
          >
            <form action={options.url.pathname} method="get">
              {[...options.url.searchParams]
                .filter(([key]) => key !== "theme")
                .map(([key, value]) => (
                  <input type="hidden" name={key} value={value} />
                ))}
              <label htmlFor="theme">Theme</label>
              <select
                id="theme"
                name="theme"
                mix={[
                  controlStyles,
                  focusStyles,
                  css({ width: "auto", minWidth: "8rem", fontSize: ".8rem" }),
                ]}
              >
                {themes.map((theme) => (
                  <option
                    value={theme.id}
                    selected={theme.id === options.theme}
                  >
                    {theme.name}
                  </option>
                ))}
              </select>
              <Button type="submit">Apply</Button>
            </form>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {options.stale && (
            <Notice role="status">
              Content update rejected. Showing the last validated version.
            </Notice>
          )}
          {body}
        </main>
      </body>
    </html>
  );
}

export interface PageLink {
  path: string;
  title: string;
  parent?: string;
}
export function pageList(pages: readonly PageLink[]) {
  return (
    <ul>
      {pages.map((page) => (
        <li>
          <a href={page.path}>{page.title}</a>
        </li>
      ))}
    </ul>
  );
}
export function topicTree(
  pages: readonly PageLink[],
  parent?: string,
): RemixNode {
  const children = pages.filter((page) => page.parent === parent);
  return children.length ? (
    <ul>
      {children.map((page) => (
        <li>
          <a href={page.path}>{page.title}</a>
          {topicTree(pages, page.path)}
        </li>
      ))}
    </ul>
  ) : null;
}
export function article(html: string) {
  return <div innerHTML={unsafeHTML(html)} />;
}
export function trail(owner?: { id: string; name: string }) {
  return (
    <p>
      <small>
        <a href="/">Agent spaces</a>
        {owner && (
          <>
            {" "}
            / <a href={`/spaces/${owner.id}/`}>{owner.name}</a> /{" "}
            <a href={`/spaces/${owner.id}/search/`}>Search {owner.name}</a>
          </>
        )}
      </small>
    </p>
  );
}
