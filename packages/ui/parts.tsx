import { css, type Handle, type Props } from "remix/component";
import {
  focusStyles,
  navigationStripStyles,
  navigationItemStyles,
} from "./recipes.ts";

export function Heading(
  handle: Handle<Props<"h2"> & { level?: 1 | 2 | 3 | 4 | 5 | 6 }>,
) {
  return () => {
    const { level = 2, mix, ...props } = handle.props;
    const Tag = `h${level}` as "h2";
    return <Tag {...props} mix={[headingStyles, mix]} />;
  };
}
const headingStyles = css({
  margin: 0,
  fontFamily: "var(--hui-font-display)",
  lineHeight: 1.2,
  textWrap: "balance",
});
export function Text(
  handle: Handle<Props<"p"> & { tone?: "default" | "muted" }>,
) {
  return () => {
    const { tone = "default", mix, ...props } = handle.props;
    return <p {...props} data-tone={tone} mix={[textStyles, mix]} />;
  };
}
const textStyles = css({
  margin: 0,
  lineHeight: 1.5,
  '&[data-tone="muted"]': { color: "var(--hui-muted)" },
});

/** Null and non-finite values represent unknown progress, not zero. */
export function Progress(
  handle: Handle<
    Omit<Props<"progress">, "value" | "max"> & {
      value: number | null;
      max?: number;
    }
  >,
) {
  return () => {
    const { value, max = 100, mix, ...props } = handle.props;
    const limit = Number.isFinite(max) && max > 0 ? max : 100;
    const normalized =
      value !== null && Number.isFinite(value)
        ? Math.max(0, Math.min(limit, value))
        : undefined;
    return (
      <progress
        {...props}
        max={limit}
        value={normalized}
        mix={[progressStyles, mix]}
      />
    );
  };
}
const progressStyles = css({
  display: "block",
  width: "100%",
  height: "0.5rem",
  accentColor: "var(--hui-accent)",
});
export function Breadcrumbs(handle: Handle<Props<"nav">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <nav aria-label="Breadcrumb" {...props} mix={mix} />;
  };
}
export function BreadcrumbList(handle: Handle<Props<"ol">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <ol {...props} mix={[breadcrumbListStyles, mix]} />;
  };
}
const breadcrumbListStyles = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.35rem",
  listStyle: "none",
  padding: 0,
  margin: 0,
  color: "var(--hui-muted)",
  fontSize: "0.875rem",
});
export function BreadcrumbItem(handle: Handle<Props<"li">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <li {...props} mix={[crumbStyles, mix]} />;
  };
}
const crumbStyles = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  minWidth: 0,
  overflowWrap: "anywhere",
});
export function BreadcrumbLink(handle: Handle<Props<"a"> & { href: string }>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <a {...props} mix={[linkStyles, focusStyles, mix]} />;
  };
}
const linkStyles = css({
  color: "inherit",
  textDecoration: "none",
  "&:hover": { textDecoration: "underline" },
});
export function BreadcrumbPage(handle: Handle<Props<"span">>) {
  return () => <span {...handle.props} aria-current="page" />;
}
export function BreadcrumbSeparator(handle: Handle<Props<"span">>) {
  return () => (
    <span {...handle.props} aria-hidden="true">
      {handle.props.children ?? "/"}
    </span>
  );
}
/** Native link navigation, without popup or menubar semantics. */
export function NavigationMenu(
  handle: Handle<Props<"nav"> & { "aria-label": string }>,
) {
  return () => {
    const { mix, ...props } = handle.props;
    return <nav {...props} mix={[navigationStripStyles, mix]} />;
  };
}
export function NavigationMenuLink(
  handle: Handle<Props<"a"> & { href: string }>,
) {
  return () => {
    const { mix, ...props } = handle.props;
    return <a {...props} mix={[navigationItemStyles, focusStyles, mix]} />;
  };
}
export function Collapsible(handle: Handle<Props<"details">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <details {...props} mix={[collapsibleStyles, mix]} />;
  };
}
const collapsibleStyles = css({
  border: "1px solid var(--hui-border)",
  borderRadius: "var(--hui-panel-radius)",
});
export function CollapsibleTrigger(handle: Handle<Props<"summary">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <summary {...props} mix={[summaryStyles, focusStyles, mix]} />;
  };
}
const summaryStyles = css({
  cursor: "pointer",
  padding: "var(--hui-space)",
  fontWeight: 600,
  minHeight: "var(--hui-control-height)",
});
export function CollapsibleContent(handle: Handle<Props<"div">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <div {...props} mix={[contentStyles, mix]} />;
  };
}
const contentStyles = css({ padding: "var(--hui-space)" });
export function TableContainer(handle: Handle<Props<"div">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <div {...props} mix={[tableContainerStyles, mix]} />;
  };
}
const tableContainerStyles = css({
  maxWidth: "100%",
  overflowX: "auto",
  border: "1px solid var(--hui-table-border)",
  background: "var(--hui-table-container-surface)",
});
export function Table(handle: Handle<Props<"table">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <table {...props} mix={[tableStyles, mix]} />;
  };
}
const tableStyles = css({
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "var(--hui-table-text-size)",
  color: "var(--hui-ink)",
  background: "var(--hui-table-surface)",
  "& tr + tr, & thead + tbody > tr:first-child, & tbody + tfoot > tr:first-child":
    { borderTop: "1px solid var(--hui-table-border)" },
  "& tbody > tr:nth-child(even)": { background: "var(--hui-table-stripe)" },
  "& tbody > tr:hover": { background: "var(--hui-hover-surface)" },
  "& thead": {
    background: "var(--hui-table-header)",
    backgroundImage: "var(--hui-table-header-image)",
    boxShadow: "var(--hui-table-header-shadow)",
  },
  fontVariantNumeric: "tabular-nums",
});
export function TableHeader(handle: Handle<Props<"thead">>) {
  return () => <thead {...handle.props} />;
}
export function TableBody(handle: Handle<Props<"tbody">>) {
  return () => <tbody {...handle.props} />;
}
export function TableFooter(handle: Handle<Props<"tfoot">>) {
  return () => <tfoot {...handle.props} />;
}
export function TableCaption(handle: Handle<Props<"caption">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <caption {...props} mix={[captionStyles, mix]} />;
  };
}
const captionStyles = css({
  textAlign: "start",
  padding: "var(--hui-space)",
  color: "var(--hui-muted)",
});
export function TableRow(handle: Handle<Props<"tr">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <tr {...props} mix={mix} />;
  };
}
export function TableHead(handle: Handle<Props<"th">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <th scope="col" {...props} mix={[cellStyles, headStyles, mix]} />;
  };
}
export function TableCell(handle: Handle<Props<"td">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <td {...props} mix={[cellStyles, mix]} />;
  };
}
const cellStyles = css({
  textAlign: "start",
  verticalAlign: "top",
  padding: "var(--hui-table-cell-padding)",
  "& + th, & + td": { borderLeft: "var(--hui-table-column-border)" },
});
const headStyles = css({
  fontWeight: 600,
  fontSize: "var(--hui-table-header-text-size)",
});
