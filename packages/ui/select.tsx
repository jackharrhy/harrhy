import { css, type Handle, type Props } from "remix/component";
import * as select from "@remix-run/ui/select";
import * as popover from "@remix-run/ui/popover";
import { Field, mergeIds } from "./components.tsx";
import { controlStyles, focusStyles } from "./recipes.ts";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  textValue?: string;
}
export type SelectProps = Omit<
  Props<"button">,
  "children" | "type" | "name" | "value" | "defaultValue" | "disabled"
> & {
  options: readonly SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
};

/** Uncontrolled official select composition; interaction stays upstream-owned. */
export function Select(handle: Handle<SelectProps>) {
  return () => {
    const {
      options,
      defaultValue,
      placeholder = "Choose an option",
      name,
      disabled,
      onValueChange,
      ...buttonProps
    } = handle.props;
    const field = handle.context.get(Field);
    const triggerId =
      field?.controlId ?? buttonProps.id ?? `${handle.id}-trigger`;
    const defaultLabel =
      options.find((option) => option.value === defaultValue)?.label ??
      placeholder;
    return (
      <select.Context
        defaultLabel={defaultLabel}
        defaultValue={defaultValue}
        name={name}
        disabled={disabled}
      >
        <SelectTrigger
          {...buttonProps}
          id={triggerId}
          onValueChange={onValueChange}
        />
        <popover.Context>
          <div
            data-part="select-popover"
            mix={[surfaceStyles, select.popover()]}
          >
            <div aria-labelledby={triggerId} mix={[listStyles, select.list()]}>
              {options.map((option) => (
                <div
                  key={option.value}
                  mix={[optionStyles, select.option(option)]}
                >
                  {option.label}
                </div>
              ))}
            </div>
          </div>
        </popover.Context>
        <input mix={select.hiddenInput()} />
      </select.Context>
    );
  };
}
function SelectTrigger(handle: Handle<Omit<SelectProps, "options">>) {
  const context = handle.context.get(select.Context);
  return () => {
    const { mix, onValueChange, ...props } = handle.props;
    const field = handle.context.get(Field);
    return (
      <button
        {...props}
        type="button"
        id={field?.controlId ?? props.id}
        aria-invalid={field?.errorId ? true : props["aria-invalid"]}
        aria-describedby={mergeIds(
          props["aria-describedby"],
          field?.descriptionId,
          field?.errorId,
          context.selectedId,
        )}
        mix={[
          controlStyles,
          triggerStyles,
          focusStyles,
          select.trigger(),
          select.onSelectChange((event) => {
            if (event.value !== null) onValueChange?.(event.value);
          }),
          mix,
        ]}
      >
        <span>{context.displayedLabel}</span>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </button>
    );
  };
}
const triggerStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  textAlign: "start",
  cursor: "pointer",
});
const surfaceStyles = css({
  padding: "0",
  margin: "0",
  color: "var(--hui-ink)",
  background: "var(--hui-elevated)",
  border: "var(--hui-border-width) solid var(--hui-control-border)",
  borderRadius: "var(--hui-control-radius)",
  fontFamily: "var(--hui-font-control)",
});
const listStyles = css({
  maxHeight: "18rem",
  overflowY: "auto",
  padding: "var(--hui-field-gap)",
});
const optionStyles = css({
  padding: "var(--hui-control-padding)",
  cursor: "pointer",
  '&[data-highlighted="true"], &[aria-selected="true"]': {
    background: "var(--hui-accent)",
    color: "var(--hui-on-accent)",
  },
  '&[aria-disabled="true"]': { opacity: "0.65", cursor: "not-allowed" },
  "&:focus-visible": { outline: "2px solid var(--hui-focus)" },
});
