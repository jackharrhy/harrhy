import { css, type Handle, type Props } from "remix/component";
import * as accordion from "@remix-run/ui/accordion";
import * as menu from "@remix-run/ui/menu";
import { buttonStyles, focusStyles, popupOffset } from "./recipes.ts";

export type AccordionProps = accordion.AccordionContextProps;
export function Accordion(handle: Handle<AccordionProps>) {
  return () => (
    <accordion.Context {...handle.props}>
      <div mix={accordion.root()}>{handle.props.children}</div>
    </accordion.Context>
  );
}
export function AccordionItem(
  handle: Handle<Props<"div"> & accordion.AccordionItemOptions>,
) {
  return () => {
    const { value, disabled, mix, ...props } = handle.props;
    return (
      <accordion.ItemContext value={value} disabled={disabled}>
        <div {...props} mix={[accordionItemStyles, accordion.item(), mix]} />
      </accordion.ItemContext>
    );
  };
}
const accordionItemStyles = css({
  borderBottom: "1px solid var(--hui-border)",
});
export function AccordionTrigger(handle: Handle<Props<"button">>) {
  return () => {
    const { disabled, mix, ...props } = handle.props;
    return (
      <button
        {...props}
        type="button"
        disabled={disabled}
        mix={[
          accordionTriggerStyles,
          focusStyles,
          accordion.trigger({ disabled }),
          mix,
        ]}
      >
        <span>{props.children}</span>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
    );
  };
}
const accordionTriggerStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  width: "100%",
  textAlign: "start",
  font: "inherit",
  fontWeight: 600,
  color: "var(--hui-ink)",
  background: "transparent",
  border: 0,
  padding: "var(--hui-space)",
  minHeight: "var(--hui-control-height)",
  cursor: "pointer",
  '&[aria-expanded="true"] svg': { transform: "rotate(180deg)" },
  '&:disabled, &[aria-disabled="true"]': {
    color: "var(--hui-muted)",
    cursor: "default",
  },
});
export function AccordionContent(handle: Handle<Props<"div">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return (
      <div
        {...props}
        mix={[accordionContentStyles, accordion.content(), mix]}
      />
    );
  };
}
const accordionContentStyles = css({
  padding: "var(--hui-space)",
  '&[data-state="closed"]': { display: "none" },
});

export type MenuProps = menu.MenuProviderProps;
export type MenuSelectItem = menu.MenuSelectItem;
export function Menu(handle: Handle<MenuProps>) {
  return () => <menu.Context {...handle.props} />;
}
export function MenuTrigger(handle: Handle<Props<"button">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return (
      <button
        {...props}
        type="button"
        mix={[
          buttonStyles,
          menuTriggerStyles,
          focusStyles,
          menu.trigger({ offset: popupOffset }),
          mix,
        ]}
      />
    );
  };
}
const menuTriggerStyles = css({ alignSelf: "flex-start" });
export function MenuContent(
  handle: Handle<Props<"div"> & { onSelect?: (item: MenuSelectItem) => void }>,
) {
  return () => {
    const { mix, onSelect, ...props } = handle.props;
    return (
      <div {...props} mix={[menuSurfaceStyles, menu.popover(), mix]}>
        <div
          mix={[
            menuListStyles,
            menu.list(),
            menu.onMenuSelect((event) => onSelect?.(event.item)),
          ]}
        >
          {props.children}
        </div>
      </div>
    );
  };
}
const menuSurfaceStyles = css({
  margin: 0,
  padding: "var(--hui-popup-padding)",
  background: "var(--hui-elevated)",
  color: "var(--hui-ink)",
  border: "1px solid var(--hui-border)",
  borderRadius: "var(--hui-popup-radius)",
  maxWidth: "calc(100vw - 16px)",
  maxHeight: "min(24rem, 80dvh)",
  overflowY: "auto",
});
const menuListStyles = css({
  minWidth: "min(12rem, calc(100vw - 32px))",
  outlineOffset: "2px",
  "&:focus-visible": { outline: "2px solid var(--hui-focus)" },
});
export function MenuItem(handle: Handle<Props<"div"> & menu.MenuItemOptions>) {
  return () => {
    const {
      name,
      value,
      checked,
      disabled,
      label,
      searchValue,
      type,
      mix,
      ...props
    } = handle.props;
    return (
      <div
        {...props}
        mix={[
          menuItemStyles,
          menu.item({
            name,
            value,
            checked,
            disabled,
            label,
            searchValue,
            type,
          }),
          mix,
        ]}
      >
        <span>{props.children}</span>
        {checked ? (
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="m3 8 3 3 7-7" />
          </svg>
        ) : null}
      </div>
    );
  };
}
const menuItemStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  padding: "0.5rem 0.75rem",
  minHeight: "2.5rem",
  cursor: "default",
  borderRadius: "var(--hui-option-radius)",
  '&[data-highlighted="true"]': {
    background: "var(--hui-selected-surface)",
    color: "var(--hui-selected-ink)",
  },
  '&:disabled, &[aria-disabled="true"]': { color: "var(--hui-muted)" },
});
