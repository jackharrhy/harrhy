import { css, unsafeHTML } from "remix/component";
import type { RemixNode } from "remix/component";

const documentStyles = css({
  colorScheme: "light",
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "18px",
  lineHeight: 1.65,
  color: "#222",
  background: "#fff",
  "& *": { boxSizing: "border-box" },
  "& body": { margin: 0 },
  "& main": {
    maxWidth: "42rem",
    margin: "2.5rem auto 5rem",
    padding: "0 1.25rem",
    overflowWrap: "anywhere",
  },
  "& h1, & h2, & h3": { lineHeight: 1.25 },
  "& h1": { fontSize: "1.9rem", margin: "0 0 1.25rem" },
  "& h2": { fontSize: "1.35rem", margin: "2rem 0 .75rem" },
  "& h3": { fontSize: "1.1rem", margin: "1.5rem 0 .5rem" },
  "& p": { margin: "0 0 1rem" },
  "& a": { color: "#0645ad", textUnderlineOffset: ".12em" },
  "& a:visited": { color: "#59348c" },
  "& a:hover": { textDecorationThickness: "2px" },
  "& :focus-visible": { outline: "2px solid #0645ad", outlineOffset: "4px" },
  "& ::selection": { background: "#dbe9ff", color: "#222" },
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
    borderLeft: "2px solid #aaa",
    marginInline: 0,
    paddingLeft: "1rem",
  },
  "& code": {
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    fontSize: ".82em",
  },
  "& pre": {
    maxWidth: "100%",
    overflowX: "auto",
    padding: "1rem",
    border: "1px solid #ddd",
    lineHeight: 1.6,
    tabSize: 2,
  },
  "& table": {
    display: "block",
    maxWidth: "100%",
    overflowX: "auto",
    overflowWrap: "normal",
    borderCollapse: "collapse",
  },
  "& th, & td": {
    padding: ".35rem .75rem .35rem 0",
    textAlign: "left",
    borderBottom: "1px solid #ddd",
  },
  "& input, & button": {
    font: "inherit",
    maxWidth: "100%",
    padding: ".3rem .5rem",
    caretColor: "#0645ad",
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
  background: "white",
  padding: ".5rem",
  "&:focus": { top: ".5rem" },
});

export function document(title: string, body: RemixNode, stale = false) {
  return (
    <html lang="en" mix={documentStyles}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{title}</title>
      </head>
      <body>
        <a mix={skipStyles} href="#main">
          Skip to content
        </a>
        <main id="main" tabIndex={-1}>
          {stale && (
            <p role="status">
              Content update rejected. Showing the last validated version.
            </p>
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
