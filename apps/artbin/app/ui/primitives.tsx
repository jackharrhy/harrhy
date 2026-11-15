import { css, type Handle, type RemixNode } from "remix/component";
import {
  Button as UiButton,
  ButtonLink as UiButtonLink,
  Input,
  Textarea,
  Checkbox,
  Field,
  Panel as UiPanel,
  Stack as UiStack,
  Inline as UiInline,
  Notice,
  Badge as UiBadge,
  Progress,
  Table,
  TableContainer,
  TableRow as UiTableRow,
  TableHead,
  TableCell as UiTableCell,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Heading,
  Text,
} from "@harrhy/ui/native";
import { checkboxLabelStyles } from "@harrhy/ui/recipes";

import {
  alertStyle,
  errorAlertStyle,
  inputStyle,
  smallButtonStyle,
  successAlertStyle,
  theme,
} from "./styles.ts";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
export type ButtonVariant = "default" | "primary" | "danger";
export type ButtonSize = "default" | "small";

const blockStyle = css({
  display: "block",
  textAlign: "center",
  width: "100%",
});
const infoAlertStyle = css({ background: "#f0f6ff", borderColor: "#5b86b3" });
const warningAlertStyle = css({
  background: "#fff9e6",
  borderColor: "#b38b00",
});
const alertTitleStyle = css({ fontWeight: 500, margin: "0 0 0.25rem" });
const alertBodyStyle = css({ margin: 0 });
const badgeStyle = css({
  display: "inline-block",
  fontSize: "0.7rem",
  letterSpacing: "0.025em",
  padding: "0.125rem 0.5rem",
  textTransform: "uppercase",
});
const neutralBadgeStyle = css({ background: "var(--hui-hover-surface)" });
const infoBadgeStyle = css({ background: "#d8eaff", color: "#174a7e" });
const successBadgeStyle = css({
  background: "var(--hui-success-surface)",
  color: "var(--hui-success)",
});
const warningBadgeStyle = css({ background: "#fff0bd", color: "#745900" });
const dangerBadgeStyle = css({
  background: "var(--hui-danger-surface)",
  color: "var(--hui-danger)",
});
const headerStyle = css({
  alignItems: "flex-start",
  borderBottom: `1px solid ${theme.color.borderLight}`,
  display: "flex",
  gap: "1rem",
  justifyContent: "space-between",
  marginBottom: "1.5rem",
  paddingBottom: "0.75rem",
  "@media (max-width: 640px)": { flexDirection: "column" },
});
const headerCopyStyle = css({ minWidth: 0 });
const eyebrowStyle = css({
  color: theme.color.muted,
  fontSize: "0.7rem",
  letterSpacing: "0.08em",
  margin: "0 0 0.25rem",
  textTransform: "uppercase",
});
const titleStyle = css({
  fontSize: "1.25rem",
  fontWeight: "normal",
  margin: 0,
});
const descriptionStyle = css({
  color: theme.color.muted,
  margin: "0.375rem 0 0",
  maxWidth: "48rem",
});
const actionsStyle = css({
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
});
const sectionHeaderStyle = css({
  alignItems: "baseline",
  display: "flex",
  gap: "1rem",
  justifyContent: "space-between",
  marginBottom: "0.75rem",
});
const sectionTitleStyle = css({
  color: theme.color.muted,
  fontSize: "0.875rem",
  fontWeight: 500,
  letterSpacing: "0.025em",
  margin: 0,
  textTransform: "uppercase",
});
const sectionDescriptionStyle = css({
  color: theme.color.muted,
  fontSize: "0.875rem",
  margin: "0.25rem 0 0",
});
const emptyStyle = css({
  color: theme.color.muted,
  padding: "3rem 1rem",
  textAlign: "center",
});
const emptyTitleStyle = css({
  color: theme.color.text,
  fontWeight: 500,
  margin: "0 0 0.25rem",
});
const emptyBodyStyle = css({ margin: 0 });
const emptyActionStyle = css({ marginTop: "1rem" });
const fullWidthControlStyle = css({ width: "100%" });
const monoControlStyle = css({ fontFamily: theme.font.mono });
const requiredStyle = css({ color: theme.color.danger, marginLeft: "0.25rem" });
const progressMetaStyle = css({
  color: theme.color.muted,
  display: "flex",
  fontSize: "0.75rem",
  justifyContent: "space-between",
  marginTop: "0.25rem",
});
const tableHeaderStyle = css({
  borderBottom: `2px solid ${theme.color.subtle}`,
  textAlign: "left",
});
const tableRowStyle = css({
  borderBottom: `1px solid ${theme.color.subtle}`,
  "&:last-child": { borderBottom: 0 },
});
const tableHeaderCellStyle = css({
  color: theme.color.muted,
  fontWeight: 500,
  whiteSpace: "nowrap",
});
const statGridStyle = css({
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
});
const statStyle = css({
  borderLeft: `2px solid ${theme.color.border}`,
  paddingLeft: "0.75rem",
});
const statLabelStyle = css({
  color: theme.color.muted,
  fontSize: "0.7rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
});
const statValueStyle = css({ fontSize: "1.25rem", marginTop: "0.125rem" });
const detailGridStyle = css({
  columnGap: "1.5rem",
  display: "grid",
  gridTemplateColumns: "max-content 1fr",
  margin: 0,
  rowGap: "0.5rem",
});
const detailLabelStyle = css({ color: theme.color.muted });
const detailValueStyle = css({ margin: 0, overflowWrap: "anywhere" });
const stackStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
});
const inlineStyle = css({
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
});

export function Button(
  handle: Handle<{
    children?: RemixNode;
    type?: "button" | "submit" | "reset";
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
    disabled?: boolean;
    name?: string;
    value?: string;
    title?: string;
  }>,
) {
  return () => {
    const {
      children,
      type = "button",
      variant = "default",
      size = "default",
      block = false,
      disabled,
      name,
      value,
      title,
    } = handle.props;
    return (
      <UiButton
        variant={variant === "default" ? "secondary" : variant}
        type={type}
        disabled={disabled}
        name={name}
        value={value}
        title={title}
        mix={[
          size === "small" ? smallButtonStyle : undefined,
          block ? blockStyle : undefined,
        ]}
      >
        {children}
      </UiButton>
    );
  };
}

export function ButtonLink(
  handle: Handle<{
    href: string;
    children?: RemixNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
    download?: boolean | string;
    target?: string;
    rel?: string;
    title?: string;
    document?: boolean;
  }>,
) {
  return () => {
    const {
      href,
      children,
      variant = "default",
      size = "default",
      block = false,
      download,
      target,
      rel,
      title,
      document = false,
    } = handle.props;
    return (
      <UiButtonLink
        variant={variant === "default" ? "secondary" : variant}
        href={href}
        download={download}
        target={target}
        rel={rel}
        title={title}
        data-rmx-document={document ? "" : undefined}
        mix={[
          size === "small" ? smallButtonStyle : undefined,
          block ? blockStyle : undefined,
        ]}
      >
        {children}
      </UiButtonLink>
    );
  };
}

export function Alert(
  handle: Handle<{ children?: RemixNode; title?: string; tone?: Tone }>,
) {
  return () => {
    const { children, title, tone = "neutral" } = handle.props;
    return (
      <Notice
        tone={tone === "danger" || tone === "success" ? tone : "neutral"}
        role={tone === "danger" ? "alert" : "status"}
        mix={[
          alertStyle,
          tone === "danger" ? errorAlertStyle : undefined,
          tone === "success" ? successAlertStyle : undefined,
          tone === "info" ? infoAlertStyle : undefined,
          tone === "warning" ? warningAlertStyle : undefined,
        ]}
      >
        {title ? <p mix={alertTitleStyle}>{title}</p> : null}
        <div mix={alertBodyStyle}>{children}</div>
      </Notice>
    );
  };
}

export function Badge(handle: Handle<{ children?: RemixNode; tone?: Tone }>) {
  return () => {
    const { children, tone = "neutral" } = handle.props;
    return (
      <UiBadge
        mix={[
          badgeStyle,
          tone === "neutral" ? neutralBadgeStyle : undefined,
          tone === "info" ? infoBadgeStyle : undefined,
          tone === "success" ? successBadgeStyle : undefined,
          tone === "warning" ? warningBadgeStyle : undefined,
          tone === "danger" ? dangerBadgeStyle : undefined,
        ]}
      >
        {children}
      </UiBadge>
    );
  };
}

export function Panel(handle: Handle<{ children?: RemixNode }>) {
  return () => <UiPanel>{handle.props.children}</UiPanel>;
}

export function PageHeader(
  handle: Handle<{
    title: string;
    eyebrow?: string;
    description?: string;
    actions?: RemixNode;
  }>,
) {
  return () => {
    const { title, eyebrow, description, actions } = handle.props;
    return (
      <header mix={headerStyle}>
        <div mix={headerCopyStyle}>
          {eyebrow ? <p mix={eyebrowStyle}>{eyebrow}</p> : null}
          <Heading level={1} mix={titleStyle}>
            {title}
          </Heading>
          {description ? <p mix={descriptionStyle}>{description}</p> : null}
        </div>
        {actions ? <div mix={actionsStyle}>{actions}</div> : null}
      </header>
    );
  };
}

export function SectionHeader(
  handle: Handle<{ title: string; description?: string; actions?: RemixNode }>,
) {
  return () => {
    const { title, description, actions } = handle.props;
    return (
      <header mix={sectionHeaderStyle}>
        <div>
          <Heading mix={sectionTitleStyle}>{title}</Heading>
          {description ? (
            <p mix={sectionDescriptionStyle}>{description}</p>
          ) : null}
        </div>
        {actions ? <div mix={actionsStyle}>{actions}</div> : null}
      </header>
    );
  };
}

export function EmptyState(
  handle: Handle<{ title: string; description?: string; action?: RemixNode }>,
) {
  return () => {
    const { title, description, action } = handle.props;
    return (
      <div mix={emptyStyle}>
        <Text mix={emptyTitleStyle}>{title}</Text>
        {description ? (
          <Text tone="muted" mix={emptyBodyStyle}>
            {description}
          </Text>
        ) : null}
        {action ? <div mix={emptyActionStyle}>{action}</div> : null}
      </div>
    );
  };
}

export function FormField(
  handle: Handle<{
    label: string;
    htmlFor?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    children?: RemixNode;
  }>,
) {
  return () => {
    const { label, htmlFor, hint, error, required, children } = handle.props;
    return (
      <Field
        id={htmlFor ?? `${handle.id}-control`}
        label={
          <>
            {label}
            {required ? (
              <span aria-hidden="true" mix={requiredStyle}>
                *
              </span>
            ) : null}
          </>
        }
        description={hint}
        error={error ? <span role="alert">{error}</span> : undefined}
      >
        {children}
      </Field>
    );
  };
}

export function TextInput(
  handle: Handle<{
    id?: string;
    name?: string;
    value?: string;
    placeholder?: string;
    pattern?: string;
    required?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    fullWidth?: boolean;
    mono?: boolean;
  }>,
) {
  return () => (
    <Input
      id={handle.props.id}
      name={handle.props.name}
      type="text"
      value={handle.props.value}
      placeholder={handle.props.placeholder}
      pattern={handle.props.pattern}
      required={handle.props.required}
      disabled={handle.props.disabled}
      readOnly={handle.props.readOnly}
      mix={[
        handle.props.fullWidth ? fullWidthControlStyle : undefined,
        handle.props.mono ? monoControlStyle : undefined,
      ]}
    />
  );
}

export function SelectInput(
  handle: Handle<{
    id?: string;
    name?: string;
    value?: string;
    required?: boolean;
    disabled?: boolean;
    fullWidth?: boolean;
    children?: RemixNode;
  }>,
) {
  return () => {
    const field = handle.context.get(Field);
    return (
      <select
        id={field?.controlId ?? handle.props.id}
        aria-describedby={
          [field?.descriptionId, field?.errorId].filter(Boolean).join(" ") ||
          undefined
        }
        aria-invalid={field?.errorId ? true : undefined}
        name={handle.props.name}
        value={handle.props.value}
        required={handle.props.required}
        disabled={handle.props.disabled}
        mix={[
          inputStyle,
          handle.props.fullWidth ? fullWidthControlStyle : undefined,
        ]}
      >
        {handle.props.children}
      </select>
    );
  };
}

export function TextArea(
  handle: Handle<{
    id?: string;
    name?: string;
    value?: string;
    placeholder?: string;
    rows?: number;
    required?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    fullWidth?: boolean;
    mono?: boolean;
  }>,
) {
  return () => (
    <Textarea
      id={handle.props.id}
      name={handle.props.name}
      value={handle.props.value}
      placeholder={handle.props.placeholder}
      rows={handle.props.rows}
      required={handle.props.required}
      disabled={handle.props.disabled}
      readOnly={handle.props.readOnly}
      mix={[
        handle.props.fullWidth ? fullWidthControlStyle : undefined,
        handle.props.mono ? monoControlStyle : undefined,
      ]}
    />
  );
}

export function CheckboxField(
  handle: Handle<{
    name?: string;
    value?: string;
    checked?: boolean;
    disabled?: boolean;
    children?: RemixNode;
  }>,
) {
  return () => (
    <label mix={checkboxLabelStyles}>
      <Checkbox
        name={handle.props.name}
        value={handle.props.value}
        checked={handle.props.checked}
        disabled={handle.props.disabled}
      />
      <span>{handle.props.children}</span>
    </label>
  );
}

export function ProgressBar(
  handle: Handle<{ value: number | null; label?: string; detail?: string }>,
) {
  return () => {
    const { value, label, detail } = handle.props;
    const normalized =
      value === null || !Number.isFinite(value)
        ? null
        : Math.max(0, Math.min(100, value));
    return (
      <div>
        <Progress value={normalized} aria-label={label ?? "Progress"} />
        {label || detail ? (
          <div mix={progressMetaStyle}>
            <span>{label}</span>
            <span>
              {detail ?? (normalized === null ? "Working…" : `${normalized}%`)}
            </span>
          </div>
        ) : null}
      </div>
    );
  };
}
export function DataTable(
  handle: Handle<{ label: string; children?: RemixNode }>,
) {
  return () => (
    <TableContainer tabindex={0} role="region" aria-label={handle.props.label}>
      <Table aria-label={handle.props.label}>{handle.props.children}</Table>
    </TableContainer>
  );
}
export function TableHeaderRow(handle: Handle<{ children?: RemixNode }>) {
  return () => (
    <UiTableRow mix={tableHeaderStyle}>{handle.props.children}</UiTableRow>
  );
}
export function TableRow(handle: Handle<{ children?: RemixNode }>) {
  return () => (
    <UiTableRow mix={tableRowStyle}>{handle.props.children}</UiTableRow>
  );
}
export function TableHeaderCell(handle: Handle<{ children?: RemixNode }>) {
  return () => (
    <TableHead mix={tableHeaderCellStyle}>{handle.props.children}</TableHead>
  );
}
export function TableCell(handle: Handle<{ children?: RemixNode }>) {
  return () => <UiTableCell>{handle.props.children}</UiTableCell>;
}

export function StatGrid(handle: Handle<{ children?: RemixNode }>) {
  return () => <div mix={statGridStyle}>{handle.props.children}</div>;
}

export function Stat(
  handle: Handle<{ label: string; value: string | number }>,
) {
  return () => (
    <div mix={statStyle}>
      <div mix={statLabelStyle}>{handle.props.label}</div>
      <div mix={statValueStyle}>{handle.props.value}</div>
    </div>
  );
}

export function DetailList(handle: Handle<{ children?: RemixNode }>) {
  return () => <dl mix={detailGridStyle}>{handle.props.children}</dl>;
}

export function Detail(
  handle: Handle<{ label: string; children?: RemixNode }>,
) {
  return () => (
    <>
      <dt mix={detailLabelStyle}>{handle.props.label}</dt>
      <dd mix={detailValueStyle}>{handle.props.children}</dd>
    </>
  );
}

export function Disclosure(
  handle: Handle<{ summary: string; children?: RemixNode; open?: boolean }>,
) {
  return () => (
    <Collapsible open={handle.props.open}>
      <CollapsibleTrigger>{handle.props.summary}</CollapsibleTrigger>
      <CollapsibleContent>{handle.props.children}</CollapsibleContent>
    </Collapsible>
  );
}

export function Stack(handle: Handle<{ children?: RemixNode }>) {
  return () => <UiStack mix={stackStyle}>{handle.props.children}</UiStack>;
}

export function Inline(handle: Handle<{ children?: RemixNode }>) {
  return () => <UiInline mix={inlineStyle}>{handle.props.children}</UiInline>;
}
