import { on, type Handle, type Props, type RemixNode } from "remix/component";
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
  rangeStyles,
  stackStyles,
  visuallyHiddenStyles,
} from "./recipes.ts";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
interface ButtonActionOptions {
  action: (details: { signal: AbortSignal }) => Promise<unknown>;
  pendingLabel: string;
  onError: (error: unknown) => void;
}
type NativeButtonProps = Props<"button"> & { variant?: ButtonVariant };
export type ButtonProps = NativeButtonProps &
  (
    | { action?: never; pendingLabel?: never; onError?: never }
    | (ButtonActionOptions & { type?: "button" })
  );
export function Button(handle: Handle<ButtonProps>) {
  return () => {
    const props = handle.props;
    if (props.action) return <AsyncButton {...props} />;
    const {
      action: _action,
      pendingLabel: _pendingLabel,
      onError: _onError,
      ...native
    } = props;
    return <NativeButton {...native} />;
  };
}
function NativeButton(handle: Handle<NativeButtonProps>) {
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

/** Native range semantics, keyboard handling and value events remain browser-owned. */
export function Range(
  handle: Handle<Omit<Props<"input">, "type" | "role"> & { role?: "slider" }>,
) {
  return () => {
    const { mix, ...props } = handle.props;
    return (
      <input {...props} type="range" mix={[rangeStyles, focusStyles, mix]} />
    );
  };
}

type AsyncButtonProps = Omit<NativeButtonProps, "type"> & ButtonActionOptions;

/** Client-owned action, never a replacement for a native submit button. */
function AsyncButton(handle: Handle<AsyncButtonProps>) {
  let state: "idle" | "pending" = "idle";
  let controller: AbortController | undefined;
  let announcement = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  handle.signal.addEventListener(
    "abort",
    () => {
      controller?.abort();
      clearTimeout(timer);
    },
    { once: true },
  );

  async function activate(
    event: MouseEvent & { currentTarget: HTMLButtonElement },
  ) {
    if (event.defaultPrevented) return;
    if (
      state === "pending" ||
      handle.props.disabled ||
      handle.props["aria-disabled"] === true ||
      handle.props["aria-disabled"] === "true" ||
      event.currentTarget.matches(":disabled")
    ) {
      event.preventDefault();
      return;
    }
    state = "pending";
    const current = new AbortController();
    controller = current;
    announcement = "";
    timer = setTimeout(() => {
      if (current.signal.aborted) return;
      announcement = handle.props.pendingLabel;
      handle.update();
    }, 1000);
    handle.update();
    try {
      await handle.props.action({ signal: current.signal });
    } catch (error) {
      if (!current.signal.aborted) handle.props.onError(error);
    } finally {
      clearTimeout(timer);
      if (!current.signal.aborted) {
        state = "idle";
        announcement = "";
        controller = undefined;
        handle.update();
      }
    }
  }

  return () => {
    const {
      action: _action,
      pendingLabel,
      onError: _onError,
      children,
      mix,
      ...props
    } = handle.props;
    return (
      <>
        <NativeButton
          {...props}
          type="button"
          aria-busy={state === "pending" ? true : undefined}
          aria-disabled={state === "pending" ? true : props["aria-disabled"]}
          data-pending={state === "pending" ? "" : undefined}
          mix={[mix, on("click", activate)]}
        >
          {state === "pending" ? pendingLabel : children}
        </NativeButton>
        <span role="status" aria-live="polite" mix={visuallyHiddenStyles}>
          {announcement}
        </span>
      </>
    );
  };
}

export * from "./parts.tsx";
