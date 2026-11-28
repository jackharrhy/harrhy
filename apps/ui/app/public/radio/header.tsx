import { css, type Handle, type RemixNode } from "remix/component";

import {
  Breadcrumbs,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@harrhy/ui/native";

import { Icon, type IconSet } from "@harrhy/ui/icons";
import { desktopStyle } from "./desktop-styles.ts";

type RadioStatusTone = "offline" | "online" | "syncing";

export function RadioHeader(
  handle: Handle<{
    icons?: IconSet;
    roomName?: string;
    sceneHref?: string;
    status?: RemixNode;
  }>,
) {
  return () => {
    let roomName = handle.props.roomName;

    return (
      <header mix={[desktopStyle.titleBar, radioHeaderStyle.header]}>
        <Breadcrumbs mix={css({ minWidth: 0 })}>
          <BreadcrumbList mix={radioHeaderStyle.breadcrumbs}>
            <BreadcrumbItem>
              <BreadcrumbLink
                href={handle.props.sceneHref ?? "/scenes/radio"}
                mix={radioHeaderStyle.brandLink}
              >
                radio
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbSeparator mix={radioHeaderStyle.separator} />
              {roomName ? (
                <BreadcrumbLink
                  href={handle.props.sceneHref ?? "/scenes/radio"}
                  mix={radioHeaderStyle.roomsLink}
                >
                  <Icon name="back" icons={handle.props.icons} />
                  <span>rooms</span>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage mix={radioHeaderStyle.rootCrumb}>
                  rooms
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {roomName ? (
              <BreadcrumbItem
                mix={css({ flex: "0 1 auto", overflow: "hidden" })}
              >
                <BreadcrumbSeparator mix={radioHeaderStyle.separator} />
                <BreadcrumbPage mix={radioHeaderStyle.currentCrumb}>
                  {roomName}
                </BreadcrumbPage>
              </BreadcrumbItem>
            ) : null}
          </BreadcrumbList>
        </Breadcrumbs>
        {handle.props.status ?? (
          <RadioStatus label="online" tone="online">
            online
          </RadioStatus>
        )}
      </header>
    );
  };
}

export function RadioStatus(
  handle: Handle<{
    label: string;
    tone: RadioStatusTone;
    children?: RemixNode;
  }>,
) {
  return () => (
    <output
      aria-label={handle.props.label}
      data-tone={handle.props.tone}
      mix={radioHeaderStyle.status}
    >
      <span aria-hidden="true">{handle.props.children}</span>
    </output>
  );
}

const radioHeaderStyle = {
  header: css({
    justifyContent: "space-between",
    gap: "0.75rem",
  }),
  breadcrumbs: css({
    "--hui-muted": "var(--radio-title-ink, var(--hui-ink))",
    minWidth: 0,
    display: "flex",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.8125rem",
    fontWeight: 400,
    lineHeight: "1.25rem",
    whiteSpace: "nowrap",
  }),
  brandLink: css({
    color: "inherit",
    fontWeight: 700,
    textDecoration: "none",
    "&:focus-visible": {
      outline: "1px solid currentColor",
      outlineOffset: "1px",
    },
  }),
  roomsLink: css({
    minWidth: 0,
    height: "1.375rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.1875rem",
    color: "inherit",
    borderRadius: "0.125rem",
    textDecoration: "none",
    textShadow: "var(--radio-title-shadow, none)",
    "&:hover": {
      color: "inherit",
      background: "rgba(255, 255, 255, 0.12)",
    },
    "&:focus-visible": {
      color: "inherit",
      outline: "1px solid currentColor",
      outlineOffset: "1px",
    },
  }),
  rootCrumb: css({ color: "inherit" }),
  separator: css({
    color: "currentColor",
    opacity: 0.45,
  }),
  currentCrumb: css({
    overflow: "hidden",
    color: "inherit",
    textOverflow: "ellipsis",
  }),
  status: css({
    width: "0.75rem",
    flex: "0 0 0.75rem",
    height: "100%",
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    position: "relative",
    color: "inherit",
    font: "inherit",
    fontSize: "0.75rem",
    textShadow: "var(--radio-title-shadow, none)",
    "&::before": {
      content: '""',
      boxSizing: "border-box",
      flex: "0 0 0.75rem",
      width: "0.75rem",
      height: "0.75rem",
      border: "1px solid rgba(31, 42, 49, 0.72)",
      borderRadius: "50%",
      boxShadow:
        "0 1px rgba(255, 255, 255, 0.5) inset, 0 1px 2px rgba(0, 0, 0, 0.35)",
    },
    '&[data-tone="offline"]::before': {
      background:
        "radial-gradient(circle at 35% 30%, #ffd2cc, #d9574f 55%, #8f2722)",
    },
    '&[data-tone="syncing"]::before': {
      background:
        "radial-gradient(circle at 35% 30%, #fff2bd, #d9ad35 55%, #8f6818)",
    },
    '&[data-tone="online"]::before': {
      background:
        "radial-gradient(circle at 35% 30%, #d5f6dc, #43a85b 55%, #236b34)",
    },
    "& > span": {
      position: "absolute",
      top: "50%",
      right: "1.25rem",
      opacity: 0,
      transform: "translate(0.25rem, -50%)",
      transition: "opacity 120ms ease, transform 120ms ease",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
    },
    "& > span > i": {
      padding: "0 0.25rem",
      opacity: 0.42,
      fontStyle: "normal",
    },
    "&:hover > span": {
      opacity: 1,
      transform: "translate(0, -50%)",
    },
    "@media (prefers-reduced-motion: reduce)": {
      "& > span": { transition: "none" },
    },
  }),
} as const;
