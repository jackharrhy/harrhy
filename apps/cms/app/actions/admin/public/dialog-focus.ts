import { ref } from "remix/component";

// Conditional dialog removal happens before the native shell can restore focus.
export function restoreDialogFocus() {
  return ref<HTMLDialogElement>((_node, signal) => {
    const opener = document.activeElement;
    signal.addEventListener(
      "abort",
      () => {
        queueMicrotask(() => {
          if (opener instanceof HTMLElement && opener.isConnected)
            opener.focus();
        });
      },
      { once: true },
    );
  });
}
