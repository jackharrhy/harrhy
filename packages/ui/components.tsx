import type { Handle, Props, RemixNode } from "remix/component";
import {
  badgeStyles,
  buttonStyles,
  checkStyles,
  controlStyles,
  descriptionStyles,
  errorStyles,
  fieldStyles,
  focusStyles,
  inlineStyles,
  labelStyles,
  noticeStyles,
  panelStyles,
  stackStyles,
} from "./recipes.ts";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonProps = Props<"button"> & { variant?: ButtonVariant };
export function Button(handle: Handle<ButtonProps>) {
  return () => {
    const {
      variant = "secondary",
      mix,
      type = "button",
      ...props
    } = handle.props;
    return (
      <button
        {...props}
        type={type}
        data-variant={variant}
        mix={[buttonStyles, focusStyles, mix]}
      />
    );
  };
}
export type ButtonLinkProps = Props<"a"> & {
  href: string;
  variant?: ButtonVariant;
};
export function ButtonLink(handle: Handle<ButtonLinkProps>) {
  return () => {
    const { variant = "secondary", mix, ...props } = handle.props;
    return (
      <a
        {...props}
        data-variant={variant}
        mix={[buttonStyles, focusStyles, mix]}
      />
    );
  };
}

export interface FieldProps {
  id: string;
  label: RemixNode;
  description?: RemixNode;
  error?: RemixNode;
  children: RemixNode;
}
interface FieldContext {
  controlId: string;
  descriptionId?: string;
  errorId?: string;
}
/** One labelled control per Field. Use a native fieldset/legend for groups. */
export function Field(handle: Handle<FieldProps, FieldContext>) {
  return () => {
    const { id, label, description, error, children } = handle.props;
    const hasDescription =
      description != null && description !== false && description !== "";
    const hasError = error != null && error !== false && error !== "";
    const descriptionId = hasDescription ? `${id}-description` : undefined;
    const errorId = hasError ? `${id}-error` : undefined;
    handle.context.set({ controlId: id, descriptionId, errorId });
    return (
      <div data-part="field" mix={fieldStyles}>
        <label htmlFor={id} mix={labelStyles}>
          {label}
        </label>
        {hasDescription && (
          <p id={descriptionId} mix={descriptionStyles}>
            {description}
          </p>
        )}
        {children}
        {hasError && (
          <p id={errorId} mix={errorStyles}>
            {error}
          </p>
        )}
      </div>
    );
  };
}

export function mergeIds(...values: (string | undefined)[]) {
  return (
    [
      ...new Set(
        values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []),
      ),
    ].join(" ") || undefined
  );
}
function fieldAttributes(
  field: FieldContext | undefined,
  describedBy?: string,
) {
  return {
    id: field?.controlId,
    "aria-describedby": mergeIds(
      describedBy,
      field?.descriptionId,
      field?.errorId,
    ),
    "aria-invalid": field?.errorId ? (true as const) : undefined,
  };
}
export function Input(handle: Handle<Props<"input">>) {
  return () => {
    const { mix, ...props } = handle.props;
    const field = handle.context.get(Field);
    return (
      <input
        {...props}
        {...fieldAttributes(field, props["aria-describedby"])}
        id={field?.controlId ?? props.id}
        aria-invalid={field?.errorId ? true : props["aria-invalid"]}
        mix={[controlStyles, focusStyles, mix]}
      />
    );
  };
}
export function Textarea(handle: Handle<Props<"textarea">>) {
  return () => {
    const { mix, ...props } = handle.props;
    const field = handle.context.get(Field);
    return (
      <textarea
        {...props}
        {...fieldAttributes(field, props["aria-describedby"])}
        id={field?.controlId ?? props.id}
        aria-invalid={field?.errorId ? true : props["aria-invalid"]}
        mix={[controlStyles, focusStyles, mix]}
      />
    );
  };
}
export function Checkbox(
  handle: Handle<Omit<Extract<Props<"input">, { type: "checkbox" }>, "type">>,
) {
  return () => {
    const { mix, ...props } = handle.props;
    return (
      <input {...props} type="checkbox" mix={[checkStyles, focusStyles, mix]} />
    );
  };
}
export function Panel(handle: Handle<Props<"section">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <section {...props} mix={[panelStyles, mix]} />;
  };
}
export function Stack(handle: Handle<Props<"div">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <div {...props} mix={[stackStyles, mix]} />;
  };
}
export function Inline(handle: Handle<Props<"div">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <div {...props} mix={[inlineStyles, mix]} />;
  };
}
export function Notice(
  handle: Handle<Props<"div"> & { tone?: "neutral" | "danger" | "success" }>,
) {
  return () => {
    const { tone = "neutral", mix, ...props } = handle.props;
    return <div {...props} data-tone={tone} mix={[noticeStyles, mix]} />;
  };
}
export function Badge(handle: Handle<Props<"span">>) {
  return () => {
    const { mix, ...props } = handle.props;
    return <span {...props} mix={[badgeStyles, mix]} />;
  };
}
