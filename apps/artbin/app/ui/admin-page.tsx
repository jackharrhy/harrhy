import { space } from "@harrhy/ui/styles";
import { css, type Handle, type RemixNode } from "remix/component";

import type { User } from "#db";

import { routes } from "../routes.ts";
import { adminSections, type AdminTab } from "./admin-sections.ts";
import { Page } from "./page.tsx";
import { PageHeader } from "./primitives.tsx";
import { theme } from "./styles.ts";

const layoutStyle = css({
  display: "grid",
  gridTemplateColumns: "190px minmax(0, 1fr)",
  maxWidth: "1400px",
  marginInline: "auto",
  minHeight: "calc(100dvh - 48px)",
  background: theme.color.background,
  fontFamily: theme.font.body,
  "@media (max-width: 767px)": { gridTemplateColumns: "1fr" },
});
const sidebarStyle = css({
  padding: `${space(3)} ${space(2)}`,
  borderRight: `1px solid ${theme.color.borderLight}`,
  "@media (max-width: 767px)": {
    borderRight: 0,
    borderBottom: `1px solid ${theme.color.borderLight}`,
    padding: space(2),
  },
});
const navStyle = css({
  "& h2": {
    color: theme.color.muted,
    fontSize: "0.75rem",
    fontWeight: 500,
    margin: `${space(3)} 0 ${space(1)}`,
    paddingInline: space(1),
  },
  "& a": {
    display: "block",
    padding: `${space(1.25)} ${space(1)}`,
    textDecoration: "none",
    fontSize: "0.875rem",
    color: theme.color.text,
  },
  "& a:hover": { background: theme.color.hover },
  "& a[aria-current=page]": {
    background: theme.color.subtle,
    fontWeight: 700,
    boxShadow: `inset 3px 0 ${theme.color.text}`,
  },
  "& a:focus-visible": {
    outline: `2px solid ${theme.color.text}`,
    outlineOffset: "-2px",
  },
  "@media (max-width: 767px)": {
    display: "flex",
    flexWrap: "wrap",
    gap: space(0.5),
    "& section": { display: "contents" },
    "& h2": { display: "none" },
  },
});
const contentStyle = css({
  minWidth: 0,
  padding: `${space(4)} ${space(5)}`,
  "& code": { fontFamily: theme.font.mono, overflowWrap: "anywhere" },
  "@media (max-width: 767px)": { padding: `${space(3)} ${space(2)}` },
});

export function AdminPage(
  handle: Handle<{
    user: User;
    active: AdminTab;
    title: string;
    description?: string;
    children?: RemixNode;
  }>,
) {
  return () => {
    const { user, active, title, description, children } = handle.props;

    return (
      <Page title={`${title} - Admin - artbin`} user={user}>
        <div mix={layoutStyle}>
          <aside mix={sidebarStyle}>
            <p
              mix={css({
                fontSize: "0.875rem",
                fontWeight: 700,
                margin: `0 0 ${space(2)}`,
                paddingInline: space(1),
              })}
            >
              Administration
            </p>
            <nav aria-label="Admin sections" mix={navStyle}>
              <a
                href={routes.admin.index.href()}
                aria-current={active === "overview" ? "page" : undefined}
              >
                Overview
              </a>
              {adminSections.map((section) => (
                <section key={section.label}>
                  <h2>{section.label}</h2>
                  {section.items.map((item) => (
                    <a
                      key={item.id}
                      href={item.href}
                      aria-current={active === item.id ? "page" : undefined}
                    >
                      {item.label}
                    </a>
                  ))}
                </section>
              ))}
            </nav>
          </aside>
          <main mix={contentStyle}>
            <PageHeader title={title} description={description} />
            {children}
          </main>
        </div>
      </Page>
    );
  };
}
