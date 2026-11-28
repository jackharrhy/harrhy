import {
  css,
  on,
  type Handle,
  type Props,
  type RemixNode,
} from "remix/component";
import * as select from "@remix-run/ui/select";
import * as popover from "@remix-run/ui/popover";
import { Field, mergeIds } from "./components.tsx";
import { controlStyles, focusStyles, popupOffset } from "./recipes.ts";

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
  optionLabelMix?: (option: SelectOption) => ReturnType<typeof css>[];
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
      optionLabelMix,
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
          <SelectSurface>
            <div aria-labelledby={triggerId} mix={[listStyles, select.list()]}>
              {options.map((option) => (
                <div
                  key={option.value}
                  mix={[optionStyles, select.option(option)]}
                >
                  <span mix={optionLabelMix?.(option)}>{option.label}</span>
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <path
                      d="m3 8 3 3 7-7"
                      stroke="currentColor"
                      stroke-width="1.5"
                    />
                  </svg>
                </div>
              ))}
            </div>
          </SelectSurface>
        </popover.Context>
        <input mix={select.hiddenInput()} />
      </select.Context>
    );
  };
}
function SelectSurface(handle: Handle<{ children?: RemixNode }>) {
  const context = handle.context.get(popover.Context);
  return () => (
    <div
      data-part="select-popover"
      mix={[
        surfaceStyles,
        // Use the same trigger gap as Menu; upstream still owns flip/collision.
        on("beforetoggle", (event) => {
          if (event.newState === "open" && context.anchor) {
            context.anchor = {
              target: context.anchor.target,
              options: { placement: "bottom-end", offset: popupOffset },
            };
          }
        }),
        select.popover(),
      ]}
    >
      {handle.props.children}
    </div>
  );
}
function SelectTrigger(
  handle: Handle<Omit<SelectProps, "options" | "optionLabelMix">>,
) {
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
  boxSizing: "border-box",
  maxWidth: "calc(100dvw - 2rem)",
  "@media (max-width: 37.5rem), (pointer: coarse)": { width: "10rem" },
  padding: "0",
  margin: "0",
  color: "var(--hui-ink)",
  background: "var(--hui-elevated)",
  border: "var(--hui-border-width) solid var(--hui-control-border)",
  borderRadius: "var(--hui-popup-radius)",
  boxShadow: "var(--hui-overlay-shadow)",
  fontFamily: "var(--hui-font-ui)",
});
const listStyles = css({
  display: "grid",
  gap: "var(--hui-option-gap)",
  maxHeight: "min(18rem, 60dvh)",
  overflowY: "auto",
  padding: "var(--hui-popup-padding)",
  "&:focus-visible": {
    outline: "2px solid var(--hui-focus)",
    outlineOffset: "-2px",
  },
  '&:focus-visible:has([data-highlighted="true"])': { outline: "none" },
  '&:focus-visible [data-highlighted="true"]': {
    outline: "2px solid var(--hui-focus)",
    outlineOffset: "-2px",
  },
  "@media (forced-colors: active)": {
    '& [aria-selected="true"]': { outline: "1px solid Highlight" },
  },
});
const optionStyles = css({
  boxSizing: "border-box",
  fontSize: "var(--hui-control-text-size)",
  lineHeight: "1.4",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  minHeight: "var(--hui-control-height)",
  padding: "var(--hui-control-padding)",
  borderRadius: "var(--hui-option-radius)",
  cursor: "pointer",
  "& span": { minWidth: 0, overflowWrap: "anywhere" },
  "@media (max-width: 37.5rem), (pointer: coarse)": { minHeight: "2.5rem" },
  "& svg": { visibility: "hidden", flexShrink: 0 },
  '&[aria-selected="true"]': {
    background: "var(--hui-selected-surface)",
    color: "var(--hui-selected-ink)",
    "& svg": { visibility: "visible" },
  },
  '&[data-highlighted="true"]:not([aria-selected="true"])': {
    background: "var(--hui-hover-surface)",
  },
  '&[aria-disabled="true"]': {
    color: "var(--hui-muted)",
    cursor: "not-allowed",
  },
});
