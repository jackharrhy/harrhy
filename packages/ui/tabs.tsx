import { css, type Handle, type Props } from "remix/component";
import * as tabs from "@remix-run/ui/tabs";
import { focusStyles, inlineStyles } from "./recipes.ts";

export type TabsProps = tabs.TabsContextProps;
export function Tabs(handle: Handle<TabsProps>) {
  return () => (
    <tabs.Context {...handle.props}>
      <div mix={tabs.root()}>{handle.props.children}</div>
    </tabs.Context>
  );
}
export function TabList(
  handle: Handle<Props<"div"> & { "aria-label": string }>,
) {
  return () => {
    const { mix, ...props } = handle.props;
    return <div {...props} mix={[inlineStyles, tabs.list(), mix]} />;
  };
}
export function Tab(handle: Handle<Props<"button"> & { name: string }>) {
  return () => {
    const { name, disabled, mix, ...props } = handle.props;
    return (
      <button
        {...props}
        type="button"
        disabled={disabled}
        mix={[tabStyles, focusStyles, tabs.tab({ name, disabled }), mix]}
      />
    );
  };
}
export function TabPanel(handle: Handle<Props<"div"> & { name: string }>) {
  return () => {
    const { name, mix, ...props } = handle.props;
    return <div {...props} mix={[panelStyles, tabs.panel({ name }), mix]} />;
  };
}
const tabStyles = css({
  minHeight: "var(--hui-control-height)",
  padding: "var(--hui-control-padding)",
  font: "inherit",
  color: "var(--hui-muted)",
  border: "0",
  borderBottom: "2px solid transparent",
  background: "transparent",
  cursor: "pointer",
  '&[aria-selected="true"]': {
    color: "var(--hui-ink)",
    borderBottomColor: "var(--hui-ink)",
    fontWeight: "600",
  },
  "&:disabled": { opacity: "0.65", cursor: "not-allowed" },
});
const panelStyles = css({ paddingBlock: "var(--hui-space)" });
