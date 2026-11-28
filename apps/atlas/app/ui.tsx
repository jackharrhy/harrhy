import { space as spacing } from "@harrhy/ui/styles";
import {
  annotationTitle,
  ANNOTATION_PROJECTION_VERSION,
} from "./content/annotation.ts";
import { css, unsafeHTML } from "remix/component";
import type { RemixNode } from "remix/component";
import { Button, Notice } from "@harrhy/ui/native";
import { themeRoot } from "@harrhy/ui/theme";
import { controlStyles, focusStyles } from "@harrhy/ui/recipes";
import { themes, themeMixins, type ThemeId } from "./theme.ts";
import { type DirectoryEntry, pageDirectory } from "./navigation.ts";
import type { Widget } from "./widgets.ts";
import { type Space, spacePath } from "./spaces.ts";
import {
  annotationStyles,
  commentMount,
  type ArticleEvidence,
} from "./comments/client.tsx";

const documentStyles = css({
  colorScheme: "light",
  scrollPaddingTop: "4rem",
  fontFamily: "var(--hui-font-ui)",
  fontSize: "18px",
  lineHeight: 1.65,
  color: "var(--hui-ink)",
  background: "var(--hui-canvas)",
  "& *": { boxSizing: "border-box" },
  "& body": { margin: 0 },
  "& main": {
    width: "100%",
    minWidth: 0,
    maxWidth: "72ch",
    margin: `${spacing(5)} auto ${spacing(10)}`,
    padding: `0 ${spacing(2.5)}`,
    overflowWrap: "anywhere",
  },
  "& h1, & h2, & h3": { lineHeight: 1.25 },
  "& h1": { fontSize: "1.9rem", margin: `0 0 ${spacing(2.5)}` },
  "& h2": { fontSize: "1.35rem", margin: `${spacing(4)} 0 ${spacing(1.5)}` },
  "& h3": { fontSize: "1.1rem", margin: `${spacing(3)} 0 ${spacing(1)}` },
  "& p": { margin: `0 0 ${spacing(2)}` },
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
  "& ul, & ol": { paddingLeft: spacing(3) },
  "& li": { margin: `${spacing(0.5)} 0` },
  "& li > ul": { marginBlock: `${spacing(0.5)} ${spacing(1.5)}` },
  "& small": { fontSize: ".85rem" },
  "& details": { margin: `${spacing(3)} 0` },
  "& summary": {
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: ".15em",
  },
  "& details[open] > summary": { marginBottom: spacing(1.5) },
  "& blockquote": {
    borderLeft: "2px solid var(--hui-border)",
    marginInline: 0,
    paddingLeft: spacing(2),
  },
  "& code": {
    fontFamily: "var(--hui-font-mono)",
    fontSize: ".82em",
  },
  "& [data-atlas-markdown] img": {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    marginBlock: spacing(2.5),
  },
  "& pre": {
    maxWidth: "100%",
    overflowX: "auto",
    padding: spacing(2),
    border: "1px solid var(--hui-border)",
    lineHeight: 1.6,
    tabSize: 2,
  },
  "& .atlas-diagram": { marginBlock: spacing(3), overflowX: "auto" },
  "& .atlas-diagram > svg": {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    font: "16px sans-serif",
    "--_bg": "var(--hui-surface)",
    "--_fg": "var(--hui-ink)",
    "--_m": "var(--hui-ink)",
    "--_l": "var(--hui-ink)",
    "--_s": "var(--hui-surface)",
    "--_a": "var(--hui-selected-surface)",
    "--_b": "var(--hui-border)",
    "--_c": "var(--hui-ink)",
  },
  "& .atlas-table": {
    width: "100%",
    overflowX: "auto",
    marginBlock: spacing(3),
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
    padding: `${spacing(0.7)} ${spacing(1.5)} ${spacing(0.7)} 0`,
    verticalAlign: "top",
    borderBottom: "1px solid var(--hui-border)",
  },
  "& input, & button": {
    font: "inherit",
    maxWidth: "100%",
    padding: `${spacing(0.6)} ${spacing(1)}`,
    caretColor: "var(--hui-accent)",
  },
  "@media (max-width: 520px)": {
    "& main": { marginTop: spacing(3) },
    "& h1": { fontSize: "1.7rem" },
  },
});
const skipStyles = css({
  position: "fixed",
  zIndex: 6,
  top: "-5rem",
  left: "1rem",
  background: "var(--hui-surface)",
  padding: spacing(1),
  "&:focus": { top: ".5rem" },
});

const headerStyles = css({
  position: "sticky",
  top: 0,
  zIndex: 4,
  background: "var(--hui-canvas)",
  maxWidth: "100rem",
  margin: "0 auto",
  padding: `${spacing(0.5)} ${spacing(2.5)}`,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
  alignItems: "center",
  gap: spacing(1.5),
  "& nav": {
    gridColumn: 2,
    gridRow: 1,
    maxWidth: "calc(100vw - 16rem)",
    minWidth: 0,
    borderBottom: "1px solid var(--hui-border)",
    display: "flex",
    flexWrap: "nowrap",
    overflowX: "auto",
    gap: `0 ${spacing(2)}`,
    scrollbarWidth: "thin",
  },
  "& nav a": {
    flexShrink: 0,
    whiteSpace: "nowrap",
    minHeight: "2.75rem",
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
    borderBottom: "3px solid transparent",
    marginBottom: spacing(-0.125),
    position: "relative",
    fontSize: ".8rem",
  },
  '& nav a[aria-current="page"]': {
    fontWeight: "700",
    borderBottomColor: "var(--hui-ink)",
  },
  "& nav a:hover, & nav a:visited, & nav a:focus-visible, & nav a[aria-current]":
    {
      textDecoration: "none",
    },
  "& .atlas-header-actions": {
    gridColumn: 3,
    gridRow: 1,
    justifySelf: "end",
    display: "flex",
    alignItems: "center",
    gap: spacing(0.5),
    flexShrink: 0,
  },
  "& .atlas-space-picker": { display: "none" },
  "& .atlas-space-picker[data-enhanced] button": { display: "none" },
  "& #atlas-comments-mount": { display: "inline-flex", flexShrink: 0 },
  "@media (max-width: 800px)": {
    display: "flex",
    "& nav": { display: "none" },
    "& .atlas-space-picker": {
      display: "flex",
      flex: 1,
      minWidth: 0,
      gap: spacing(1),
      alignItems: "center",
    },
    "& .atlas-space-picker select": {
      minWidth: 0,
      width: "100%",
      fontSize: "1rem",
    },
  },
});
const settingsStyles = css({
  position: "fixed",
  inset: "3.5rem max(1.25rem, calc((100vw - 100rem) / 2 + 1.25rem)) auto auto",
  margin: 0,
  maxWidth: "calc(100vw - 2.5rem)",
  padding: spacing(2),
  color: "var(--hui-ink)",
  background: "var(--hui-surface)",
  border: "1px solid var(--hui-control-border)",
  borderRadius: "var(--hui-panel-radius)",
  "& form": {
    display: "flex",
    alignItems: "center",
    gap: spacing(1.2),
    flexWrap: "wrap",
    fontSize: ".8rem",
  },
});
const layoutStyles = css({
  width: "100%",
  containerType: "inline-size",
  "& [data-atlas-markdown] > .atlas-table": {
    width: "calc(100% + 2 * max(0px, (100cqw - 72ch) / 2))",
    marginInlineStart: "calc(-1 * max(0px, (100cqw - 72ch) / 2))",
  },
  "@media (width > 1280px)": {
    "&:has(> .atlas-desktop-directory[open]) [data-atlas-markdown] > .atlas-table":
      {
        width: "calc(100% + max(0px, (100cqw - 72ch) / 2))",
        marginInlineStart: 0,
      },
  },
  "&.atlas-with-directory": {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 72ch) minmax(0, 1fr)",
  },
  "&.atlas-with-directory main": { gridColumn: 2, gridRow: 1 },
  "& .atlas-desktop-directory": {
    gridColumn: 1,
    gridRow: 1,
    width: "min(15rem, 100%)",
    justifySelf: "end",
    marginTop: spacing(5),
    position: "sticky",
    top: "4rem",
    alignSelf: "start",
    maxHeight: "calc(100dvh - 5rem)",
    scrollPaddingTop: "3.25rem",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: `0 ${spacing(1.5)} 0 ${spacing(2)}`,
    scrollbarWidth: "thin",
  },
  "& .atlas-desktop-directory[open]": {
    borderInlineEnd: "1px solid var(--hui-border)",
  },
  "& .atlas-desktop-directory > summary, & .atlas-mobile-directory > summary": {
    display: "grid",
    placeItems: "center",
    listStyle: "none",
    width: "2.75rem",
    height: "2.75rem",
    borderRadius: "var(--hui-control-radius)",
    textDecoration: "none",
  },
  "& .atlas-desktop-directory > summary": {
    position: "sticky",
    top: 0,
    marginInlineStart: "auto",
    background: "var(--hui-canvas)",
    marginBottom: "0",
    zIndex: 1,
  },
  "& .atlas-desktop-directory > summary::-webkit-details-marker, & .atlas-mobile-directory > summary::-webkit-details-marker":
    { display: "none" },
  "& details[open] > .atlas-directory-toggle svg": {
    fill: "var(--hui-selected-surface)",
  },
  "& .atlas-directory-toggle:hover": {
    background: "var(--hui-selected-surface)",
  },
  "& .atlas-directory-toggle:focus-visible": { outlineOffset: "-3px" },
  "& .atlas-mobile-directory": { display: "none" },
  "& .atlas-directory": {
    fontSize: ".8rem",
    lineHeight: 1.45,
    overflowWrap: "anywhere",
  },
  "& .atlas-directory ul": {
    listStyle: "none",
    margin: 0,
    paddingLeft: spacing(1.6),
  },
  "& .atlas-directory > ul": { paddingLeft: 0, marginTop: spacing(1.2) },
  "& .atlas-directory li": { margin: 0 },
  "& .atlas-directory a": {
    display: "inline-block",
    paddingBlock: spacing(0.54),
    textDecoration: "none",
  },
  "& .atlas-directory a:hover": { textDecoration: "underline" },
  '& .atlas-directory a[aria-current="page"]': {
    fontWeight: 600,
    textDecoration: "none",
  },
  "& .atlas-directory details": { margin: 0 },
  "& .atlas-directory summary": {
    display: "grid",
    gridTemplateColumns: ".65rem minmax(0, 1fr)",
    columnGap: spacing(0.7),
    alignItems: "start",
    listStyle: "none",
    textDecoration: "none",
    margin: 0,
  },
  "& .atlas-directory summary::marker": { content: '""' },
  "& .atlas-directory summary::-webkit-details-marker": { display: "none" },
  "& .atlas-directory summary a": {
    display: "block",
    minWidth: 0,
    maxWidth: "none",
  },
  "& .atlas-directory summary > svg": {
    marginTop: "calc(.35rem + .37em)",
    justifySelf: "center",
  },
  "& .atlas-directory details[open] > summary > svg": {
    transform: "rotate(90deg)",
  },
  "& .atlas-directory li > a": { display: "block", paddingLeft: spacing(2) },
  "& .atlas-directory ul ul ul ul": { paddingLeft: spacing(0.8) },
  "& .atlas-directory ul ul ul ul ul": { paddingLeft: 0 },
  "@media (max-width: 1280px)": {
    "&.atlas-with-directory": { display: "block" },
    "& .atlas-desktop-directory": { display: "none" },
    "& .atlas-mobile-directory": {
      display: "block",
      width: "100%",
      maxWidth: "72ch",
      margin: `${spacing(2)} auto 0`,
      paddingInline: spacing(2.5),
      fontSize: "1rem",
    },
    "& .atlas-mobile-directory .atlas-directory": {
      maxHeight: "55dvh",
      overflowY: "auto",
      overscrollBehavior: "contain",
      padding: spacing(1),
    },
  },
});
function directoryToggle() {
  return (
    <summary
      className="atlas-directory-toggle"
      aria-label="Documents"
      title="Documents"
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      >
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <path d="M9 5v14M5.75 9h1m-1 3h1" />
      </svg>
    </summary>
  );
}

function directoryEntries(
  entries: readonly DirectoryEntry[],
  current: string,
): RemixNode {
  return (
    <ul>
      {entries.map((entry) => (
        <li>
          {entry.children.length ? (
            <details open>
              <summary>
                <svg
                  data-atlas-directory-chevron
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="m8 4 8 8-8 8" />
                </svg>
                <a
                  href={entry.path}
                  aria-current={entry.path === current ? "page" : undefined}
                >
                  {entry.title}
                </a>
              </summary>
              {directoryEntries(entry.children, current)}
            </details>
          ) : (
            <a
              href={entry.path}
              aria-current={entry.path === current ? "page" : undefined}
            >
              {entry.title}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
function directory(
  owner: { id: string; name: string },
  pages: readonly PageLink[],
  current: string,
) {
  const home = `${spacePath(owner.id)}/`;
  return (
    <nav className="atlas-directory" aria-label={`${owner.name} documents`}>
      <a href={home} aria-current={current === home ? "page" : undefined}>
        {pages.find((page) => page.path === home)?.title ??
          `${owner.name} home`}
      </a>
      {directoryEntries(pageDirectory(pages, home), current)}
    </nav>
  );
}
export interface DocumentOptions {
  spaces: readonly Pick<Space, "id" | "name">[];
  stale?: boolean;
  nonce?: string;
  pages: readonly (PageLink & { author: string })[];
  comments?: { digest: string; nonce?: string };
  theme: ThemeId;
  url: URL;
  available: readonly { id: string; count: number }[];
}
export function document(
  title: string,
  body: RemixNode,
  options: DocumentOptions,
) {
  const spaces = options.spaces;
  const current = options.url.pathname.endsWith("/")
    ? options.url.pathname
    : `${options.url.pathname}/`;
  const active = spaces.find((space) =>
    current.startsWith(`${spacePath(space.id)}/`),
  );
  const pages = options.pages.filter((page) => page.author === active?.id);
  return (
    <html
      lang="en"
      data-theme={options.theme}
      mix={[
        themeMixins[options.theme],
        themeRoot,
        documentStyles,
        ...(options.comments ? [annotationStyles] : []),
      ]}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{documentTitle(title)}</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        {options.theme === "newspaper" && (
          <link rel="stylesheet" href="/fonts.css" />
        )}
      </head>
      <body>
        <a mix={skipStyles} href="#main">
          Skip to content
        </a>
        <header mix={headerStyles}>
          <nav aria-label="Agent spaces">
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
          <form
            className="atlas-space-picker"
            data-atlas-space-picker
            action="/"
            method="get"
          >
            <select
              name="space"
              aria-label="Agent space"
              disabled={!spaces.length}
              aria-description="Opens the selected agent’s home."
              mix={[controlStyles, focusStyles]}
            >
              {!active && (
                <option value="" disabled selected>
                  {spaces.length ? "Choose an agent" : "No agents available"}
                </option>
              )}
              {spaces.map((space) => (
                <option value={space.id} selected={active?.id === space.id}>
                  {space.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="quiet">
              Open
            </Button>
          </form>
          <div className="atlas-header-actions">
            {options.comments && commentMount()}
            <Button
              type="button"
              aria-label="Settings"
              variant="quiet"
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
          </div>
        </header>
        <div
          className={active ? "atlas-with-directory" : undefined}
          mix={layoutStyles}
        >
          {active && (
            <>
              <details open className="atlas-desktop-directory">
                {directoryToggle()}
                {directory(active, pages, current)}
              </details>
              <details className="atlas-mobile-directory">
                {directoryToggle()}
                {directory(active, pages, current)}
              </details>
            </>
          )}
          <main id="main" tabIndex={-1}>
            {options.stale && (
              <Notice role="status">
                Content update rejected. Showing the last validated version.
              </Notice>
            )}
            {body}
          </main>
        </div>
        <script
          type="module"
          nonce={options.nonce}
          src="/_atlas/navigation.js"
        />
        {options.comments && (
          <script
            type="module"
            nonce={options.comments.nonce}
            src={`/_atlas/comment-assets/${options.comments.digest}.js`}
          />
        )}
      </body>
    </html>
  );
}

function documentTitle(title: string): string {
  const page = title
    .replace(/^(?:🌎\s*)+/u, "")
    .replace(/(?:\s+-\s+Atlas)+$/u, "")
    .trim();
  return `${page || "Atlas"} - Atlas`;
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
export function article(
  html: string,
  widgets: readonly Widget[] = [],
  nonce?: string,
  evidence?: ArticleEvidence,
  title?: string,
) {
  const enhanced = html.replace(
    /<p>\[\[widget:([a-z][a-z0-9-]*)\]\]<\/p>/g,
    (_marker, id: string) => {
      const widget = widgets.find((candidate) => candidate.id === id);
      if (!widget) return `<p data-atlas-widget>[[widget:${id}]]</p>`;
      return `<section data-atlas-widget aria-label="Interactive content"><p id="atlas-widget-notice-${widget.id}" role="status">Interactive content requires JavaScript. The surrounding article remains readable.</p><div id="atlas-widget-${widget.id}"></div></section>`;
    },
  );
  return (
    <>
      <div
        data-atlas-article={evidence ? "" : undefined}
        data-annotation-projection-version={
          evidence ? ANNOTATION_PROJECTION_VERSION : undefined
        }
        data-article-url={evidence?.articleUrl}
        data-source-sha256={evidence?.sourceSha256}
        data-annotation-projection-sha256={evidence?.annotationProjectionSha256}
      >
        {title !== undefined && (
          <>
            <h1>{annotationTitle(title)}</h1>
            {"\n"}
          </>
        )}
        <div data-atlas-markdown innerHTML={unsafeHTML(enhanced)} />
      </div>
      {widgets.map((widget) => (
        <script
          type="module"
          nonce={nonce}
          src={`/_atlas/widgets/${widget.digest}.js`}
        />
      ))}
    </>
  );
}
