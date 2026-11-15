import { on, type Handle, type Props, type RemixNode } from "remix/component";
import { Button, type ButtonVariant } from "./components.tsx";
import { visuallyHiddenStyles } from "./recipes.ts";

export interface ActionButtonProps extends Omit<
  Props<"button">,
  "type" | "children"
> {
  children: RemixNode;
  action: (details: { signal: AbortSignal }) => Promise<unknown>;
  pendingLabel: string;
  onError: (error: unknown) => void;
  variant?: ButtonVariant;
}

/** Client-owned action, never a replacement for a native submit button. */
export function ActionButton(handle: Handle<ActionButtonProps>) {
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
        <Button
          {...props}
          type="button"
          aria-busy={state === "pending" ? true : undefined}
          aria-disabled={state === "pending" ? true : props["aria-disabled"]}
          data-pending={state === "pending" ? "" : undefined}
          mix={[mix, on("click", activate)]}
        >
          {state === "pending" ? pendingLabel : children}
        </Button>
        <span role="status" aria-live="polite" mix={visuallyHiddenStyles}>
          {announcement}
        </span>
      </>
    );
  };
}
