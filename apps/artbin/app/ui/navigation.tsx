import { css, type Handle } from "remix/component";

import {
  Breadcrumbs as UiBreadcrumbs,
  BreadcrumbList,
  BreadcrumbItem as Crumb,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  NavigationMenu,
  NavigationMenuLink,
} from "@harrhy/ui/native";

import { theme } from "./styles.ts";

const tabsStyle = css({ marginBottom: "1rem" });
const countStyle = css({
  color: theme.color.muted,
  fontSize: "0.75rem",
  marginLeft: "0.375rem",
});

export interface TabItem {
  id: string;
  href: string;
  label: string;
  count?: number | string;
}

export function Tabs(
  handle: Handle<{ items: TabItem[]; activeId: string; label: string }>,
) {
  return () => (
    <NavigationMenu mix={tabsStyle} aria-label={handle.props.label}>
      {handle.props.items.map((item) => (
        <NavigationMenuLink
          key={item.id}
          href={item.href}
          aria-current={item.id === handle.props.activeId ? "page" : undefined}
        >
          {item.label}
          {item.count === undefined ? null : (
            <span mix={countStyle}>{item.count}</span>
          )}
        </NavigationMenuLink>
      ))}
    </NavigationMenu>
  );
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs(
  handle: Handle<{ items: BreadcrumbItem[]; label?: string }>,
) {
  return () => (
    <UiBreadcrumbs
      aria-label={handle.props.label ?? "Breadcrumb"}
      mix={css({ marginBottom: "1rem" })}
    >
      <BreadcrumbList>
        {handle.props.items.map((item, index) => (
          <Crumb key={`${index}-${item.label}`}>
            {index ? <BreadcrumbSeparator /> : null}
            {item.href ? (
              <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
            ) : index === handle.props.items.length - 1 ? (
              <BreadcrumbPage>{item.label}</BreadcrumbPage>
            ) : (
              <span>{item.label}</span>
            )}
          </Crumb>
        ))}
      </BreadcrumbList>
    </UiBreadcrumbs>
  );
}
