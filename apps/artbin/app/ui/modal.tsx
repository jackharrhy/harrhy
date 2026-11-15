import { css, on, type Handle, type RemixNode } from "remix/component";
import { Dialog } from "@harrhy/ui/interactive";

const closeStyle = css({
  display: "flex",
  justifyContent: "flex-end",
  position: "absolute",
  top: "1.25rem",
  right: "1.25rem",
});
const footerStyle = css({
  borderTop: "1px solid var(--hui-border)",
  marginTop: "1rem",
  paddingTop: "1rem",
});

export function ModalFrame(
  handle: Handle<{
    title: string;
    children?: RemixNode;
    closeControl?: RemixNode;
    footer?: RemixNode;
    onDismiss?: () => void;
  }>,
) {
  const trigger =
    typeof document === "undefined" ? null : document.activeElement;
  handle.signal.addEventListener(
    "abort",
    () => {
      queueMicrotask(() => {
        if (trigger && trigger instanceof HTMLElement && trigger.isConnected)
          trigger.focus();
      });
    },
    { once: true },
  );

  return () => {
    const { title, children, closeControl, footer, onDismiss } = handle.props;
    return (
      <Dialog
        open
        title={title}
        onClose={() => onDismiss?.()}
        mix={[
          css({ position: "relative", "& > h2": { paddingRight: "2.5rem" } }),
          on("click", (event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              onDismiss?.();
          }),
        ]}
      >
        {closeControl ? <div mix={closeStyle}>{closeControl}</div> : null}
        {children}
        {footer ? <footer mix={footerStyle}>{footer}</footer> : null}
      </Dialog>
    );
  };
}
