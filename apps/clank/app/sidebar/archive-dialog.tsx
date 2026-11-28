import { DialogClose } from "../dialog-close.tsx";
import { Dialog } from "@harrhy/ui/interactive";
import { Button } from "@harrhy/ui/native";
import { css, on, type Handle } from "remix/component";
import type { ArchiveTarget, Catalog } from "../pi/catalog.ts";

export function ArchiveDialog(
  handle: Handle<{
    target: ArchiveTarget;
    archive: Catalog["archive"];
    live?: Catalog;
    close(): void;
  }>,
) {
  let phase: "confirm" | "sending" | "watching" | "error" = "confirm";
  let timer: ReturnType<typeof setTimeout>;
  handle.signal.addEventListener("abort", () => clearTimeout(timer), {
    once: true,
  });
  const connected = () => handle.props.live?.archive === handle.props.archive;
  const allowed = () =>
    connected() && handle.props.live!.canArchive(handle.props.target);
  async function confirm() {
    if (phase !== "confirm" || !allowed()) return;
    phase = "sending";
    void handle.update();
    try {
      await handle.props.archive(handle.props.target);
      if (handle.signal.aborted) return;
      phase = "watching";
      timer = setTimeout(() => {
        phase = "error";
        void handle.update();
      }, 8000);
    } catch {
      if (handle.signal.aborted) return;
      phase = "error";
    }
    await handle.update();
  }
  return () => {
    const { target, live, close } = handle.props;
    const kind = target.conversation === undefined ? "session" : "subagent";
    const pending =
      connected() && (phase === "sending" || phase === "watching");
    if (
      phase === "watching" &&
      connected() &&
      live &&
      (!live.rows.some((row) => row.id === target.session) ||
        (target.conversation !== undefined &&
          live.childrenReady &&
          !live.children[target.session]?.some(
            (child) =>
              child.conversationId === target.conversation && !child.archived,
          )))
    ) {
      handle.queueTask(close);
    }
    const error =
      !connected() || phase === "error"
        ? "Could not confirm the archive. Check the session list before trying again."
        : !pending && !allowed()
          ? "This item is no longer available to archive."
          : undefined;
    return (
      <Dialog
        open
        closedby={pending ? "none" : "closerequest"}
        title={`Archive ${kind} “${target.name}”?`}
        description={`Pi stops the ${kind} and removes it from the active list. Its history is kept.`}
        initialFocus="[data-cancel]"
        onClose={() => {
          if (!pending) close();
        }}
        mix={css({
          overflowWrap: "anywhere",
          "&:has([role=alert]) > h2": { paddingInlineEnd: "2.5rem" },
        })}
      >
        {error && <p role="alert">{error}</p>}
        {pending && <p role="status">Archiving…</p>}
        <div
          mix={css({ display: "flex", justifyContent: "end", gap: "0.5rem" })}
        >
          {error ? (
            <DialogClose label="Close archive notice" close={close} />
          ) : (
            <>
              <Button
                data-cancel=""
                disabled={pending}
                mix={on("click", close)}
              >
                Cancel
              </Button>

              <Button disabled={pending} mix={on("click", confirm)}>
                Archive
              </Button>
            </>
          )}
        </div>
      </Dialog>
    );
  };
}
