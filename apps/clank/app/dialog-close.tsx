import { space } from "@harrhy/ui/theme";
import { Button } from "@harrhy/ui/native";
import { css, on, type Handle } from "remix/component";
import { Icon } from "./icons.tsx";

export function DialogClose(
  handle: Handle<{ label: string; tabIndex?: -1; close(): void }>,
) {
  return () => (
    <Button
      variant="quiet"
      aria-label={handle.props.label}
      title={handle.props.label}
      tabIndex={handle.props.tabIndex}
      mix={[
        css({
          position: "absolute",
          insetBlockStart: space(0.25),
          insetInlineEnd: space(0.25),
          width: "2.75rem",
          height: "2.75rem",
          padding: 0,
          color: "var(--hui-muted)",
          "&:focus-visible": { outlineOffset: "-4px" },
        }),
        on("click", () => handle.props.close()),
      ]}
    >
      <Icon name="close" />
    </Button>
  );
}
