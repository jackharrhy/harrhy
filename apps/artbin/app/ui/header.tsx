import { space } from "@harrhy/ui/styles";
import { Button } from "@harrhy/ui/native";
import { displayStyles } from "@harrhy/ui/theme";
import { css, type Handle } from "remix/component";

import type { User } from "#db";
import type { SupportIdentity } from "#lib/support-login.server";

import { routes } from "../routes.ts";
import { adminBadgeStyle, theme } from "./styles.ts";

const headerStyle = css({
  alignItems: "center",
  backgroundColor: theme.color.background,
  borderBottom: `1px solid ${theme.color.borderLight}`,
  display: "flex",
  minHeight: "3rem",
  gap: space(1.5),
  flexWrap: "wrap",
  paddingBlock: space(1),
  justifyContent: "space-between",
  paddingInline: space(2),
  position: "sticky",
  top: 0,
  zIndex: 100,
});
const brandStyle = css({
  color: theme.color.text,
  fontSize: "1.125rem",
  letterSpacing: "0.025em",
  textDecoration: "none",
});
const navStyle = css({
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: space(2),
  "@media (max-width: 640px)": { gap: space(1) },
});
const adminLinkStyle = css({
  "&": {
    color: theme.color.background,
    textDecoration: "none",
    padding: `${space(0.7)} ${space(1)}`,
  },
  "&:hover": { color: theme.color.background, background: "#333" },
  "&:focus-visible": {
    outline: `2px solid ${theme.color.text}`,
    outlineOffset: "3px",
  },
});
const navLinkStyle = css({
  color: theme.color.muted,
  fontSize: "0.875rem",
  textDecoration: "none",
  "&:hover": { color: theme.color.text },
});
const supportBannerStyle = css({
  backgroundColor: "#fff3ce",
  borderBottom: "2px solid #986500",
  color: "#302000",
  display: "flex",
  flexWrap: "wrap",
  gap: space(1.5),
  justifyContent: "space-between",
  padding: `${space(1.3)} ${space(2)}`,
});
const supportExitStyle = css({
  backgroundColor: "#302000",
  border: 0,
  color: "#fff",
  cursor: "pointer",
  padding: `${space(0.7)} ${space(1.4)}`,
});

export interface HeaderProps {
  user?:
    | (Pick<User, "username" | "isAdmin"> & { support?: SupportIdentity })
    | null;
}

export function Header(handle: Handle<HeaderProps>) {
  return () => {
    const { user } = handle.props;

    return (
      <>
        {user?.support ? (
          <aside mix={supportBannerStyle} aria-label="Active support session">
            <span>
              Support session: actor{" "}
              <strong>{user.support.actorSubject}</strong> acting as{" "}
              <strong>@{user.support.targetUsername}</strong>.
            </span>
            <form method="post" action={routes.auth.supportExit.href()}>
              <input type="hidden" name="csrf" value={user.support.csrfToken} />
              <Button type="submit" mix={supportExitStyle}>
                Exit support session
              </Button>
            </form>
          </aside>
        ) : null}
        <header mix={headerStyle}>
          <a
            href={user ? routes.folders.href() : routes.home.href()}
            mix={[brandStyle, displayStyles]}
          >
            artbin
          </a>
          <nav mix={navStyle} aria-label="Main navigation">
            <a href={routes.cli.href()} mix={navLinkStyle}>
              cli
            </a>
            {user ? (
              <>
                <a href={routes.folders.href()} mix={navLinkStyle}>
                  folders
                </a>
                <a href={routes.myUploads.href()} mix={navLinkStyle}>
                  my uploads
                </a>
                <a href={routes.settings.index.href()} mix={navLinkStyle}>
                  @{user.username}
                </a>
                {user.isAdmin ? (
                  <>
                    <a
                      href={routes.admin.inbox.index.href()}
                      mix={navLinkStyle}
                    >
                      inbox
                    </a>
                    <a
                      href={routes.admin.index.href()}
                      mix={[adminBadgeStyle, adminLinkStyle]}
                    >
                      admin
                    </a>
                  </>
                ) : null}
              </>
            ) : (
              <a href={routes.login.href()} mix={navLinkStyle}>
                login
              </a>
            )}
          </nav>
        </header>
      </>
    );
  };
}
