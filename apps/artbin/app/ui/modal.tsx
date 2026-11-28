import { space } from "@harrhy/ui/styles";
import { css, type Handle, type RemixNode } from "remix/component";
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
  marginTop: space(2),
  paddingTop: space(2),
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
        mix={css({
          position: "relative",
          "& > h2": { paddingRight: space(5) },
        })}
      >
        {closeControl ? <div mix={closeStyle}>{closeControl}</div> : null}
        {children}
        {footer ? <footer mix={footerStyle}>{footer}</footer> : null}
      </Dialog>
    );
  };
}
