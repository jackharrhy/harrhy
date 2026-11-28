import { space } from "./spacing.ts";
import {
  css,
  on,
  ref,
  type Handle,
  type Props,
  type RemixNode,
} from "remix/component";

import { mergeIds } from "./components.tsx";

export interface DialogProps extends Omit<
  Props<"dialog">,
  "open" | "children"
> {
  open: boolean;
  title: string;
  description?: string;
  children: RemixNode;
  onClose: (details: { reason: "cancel" | "native"; value: string }) => void;
  /** A selector within this dialog. Otherwise native autofocus rules apply. */
  initialFocus?: string;
}

/** Controlled native modal. The owner supplies trigger, close/save actions and open state. */
export function Dialog(handle: Handle<DialogProps>) {
  let element: HTMLDialogElement | undefined;
  let reconcileCancel = false;
  const titleId = `${handle.id}-title`;
  const descriptionId = `${handle.id}-description`;

  function sync() {
    if (!element?.isConnected) return;
    if (handle.props.open && !element.open) {
      element.returnValue = "";
      element.showModal();
      if (handle.props.initialFocus)
        element.querySelector<HTMLElement>(handle.props.initialFocus)?.focus();
    } else if (!handle.props.open && element.open) element.close();
  }

  return () => {
    const {
      open: _open,
      title,
      description,
      children,
      closedby,
      closedBy,
      onClose: _onClose,
      initialFocus: _initialFocus,
      mix,
      ...props
    } = handle.props;
    handle.queueTask(sync);
    return (
      <dialog
        {...props}
        closedby={closedby ?? closedBy ?? "any"}
        aria-labelledby={titleId}
        aria-describedby={mergeIds(
          props["aria-describedby"],
          description ? descriptionId : undefined,
        )}
        mix={[
          dialogStyles,
          mix,
          ref((node, signal) => {
            element = node;
            if (!("closedBy" in HTMLDialogElement.prototype))
              installBackdropFallback(node, signal);
            signal.addEventListener(
              "abort",
              () => {
                if (node.open) node.close();
                element = undefined;
              },
              { once: true },
            );
          }),
          on("cancel", (event) => {
            // The platform can force a close, e.g. on repeated Escape.
            reconcileCancel = !event.cancelable;
            event.preventDefault();
            if (event.currentTarget.getAttribute("closedby") !== "none")
              handle.props.onClose({ reason: "cancel", value: "" });
          }),
          on("close", () => {
            if (reconcileCancel) {
              reconcileCancel = false;
              sync();
              return;
            }
            if (element && !element.open && handle.props.open)
              handle.props.onClose({
                reason: "native",
                value: element.returnValue,
              });
          }),
        ]}
      >
        <h2 id={titleId} mix={titleStyles}>
          {title}
        </h2>
        {description && (
          <p
            id={descriptionId}
            mix={css({ margin: `${space(1)} 0 0`, color: "var(--hui-muted)" })}
          >
            {description}
          </p>
        )}
        <div mix={css({ marginTop: space(2), "& > form": { margin: 0 } })}>
          {children}
        </div>
      </dialog>
    );
  };
}
// The browser retargets a modal's backdrop events to the dialog. Padding
// and descendants (including top-layer descendants) are still inside.
function installBackdropFallback(
  dialog: HTMLDialogElement,
  signal: AbortSignal,
) {
  let pointer: number | undefined;
  function onBackdrop(event: PointerEvent) {
    if (event.target !== dialog || dialog.getAttribute("closedby") !== "any")
      return false;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    return (
      event.clientX < left ||
      event.clientX >= right ||
      event.clientY < top ||
      event.clientY >= bottom
    );
  }
  dialog.addEventListener(
    "pointerdown",
    (event) => {
      pointer =
        event.isPrimary && event.button === 0 && onBackdrop(event)
          ? event.pointerId
          : undefined;
    },
    { signal },
  );
  dialog.addEventListener(
    "pointercancel",
    () => {
      pointer = undefined;
    },
    { signal },
  );
  dialog.addEventListener(
    "pointerup",
    (event) => {
      const dismiss = pointer === event.pointerId && onBackdrop(event);
      pointer = undefined;
      if (dismiss)
        dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    },
    { signal },
  );
}

const titleStyles = css({ margin: 0, fontSize: "1.25rem" });
const dialogStyles = css({
  boxSizing: "border-box",
  width: "min(32rem, calc(100vw - 2rem))",
  maxHeight: "calc(100dvh - 2rem)",
  overflow: "auto",
  padding: space(2.5),
  border: "var(--hui-border-width) solid var(--hui-border)",
  borderRadius: "var(--hui-panel-radius)",
  backgroundColor: "var(--hui-elevated)",
  backgroundImage: "var(--hui-panel-image)",
  color: "var(--hui-ink)",
  boxShadow: "var(--hui-overlay-shadow)",
  font: "inherit",
  "&::backdrop": { background: "rgb(0 0 0 / 0.4)" },
});
