import { css, on, type Handle } from "remix/component";
import { Select, type SelectProps } from "@harrhy/ui/interactive";

/** Reinitialize shared Select for external value changes, not its own selections. */
export function CmsSelect(
  handle: Handle<Omit<SelectProps, "defaultValue"> & { value: unknown }>,
) {
  let current = String(handle.props.value ?? "");
  let optionKey = JSON.stringify(handle.props.options);
  let generation = 0;
  return () => {
    const { value, options, onValueChange, mix, ...props } = handle.props;
    const selected = String(value ?? "");
    const nextOptions = JSON.stringify(options);
    if (selected !== current || nextOptions !== optionKey) {
      current = selected;
      optionKey = nextOptions;
      generation++;
    }
    return (
      <span
        mix={[
          css({ display: "contents" }),
          on("click", (event) => {
            // A wrapping label must not reactivate its trigger for popup clicks.
            if ((event.target as Element).closest('[role="option"]'))
              event.preventDefault();
          }),
        ]}
      >
        <Select
          key={generation}
          {...props}
          mix={mix}
          options={options}
          defaultValue={selected}
          onValueChange={(next) => {
            current = next;
            onValueChange?.(next);
          }}
        />
      </span>
    );
  };
}
