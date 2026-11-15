import * as assert from "remix/assert";
import { on, type Handle } from "remix/component";
import { render } from "remix/component/test";
import { it } from "remix/test";
import { ActionButton, Dialog } from "@harrhy/ui/interactive";

it("honors caller preventDefault before starting an action", async (t) => {
  let calls = 0;
  const { $, act, cleanup } = render(
    <ActionButton
      action={async () => {
        calls++;
      }}
      pendingLabel="Waiting"
      onError={() => {}}
      mix={on("click", (event) => event.preventDefault())}
    >
      Run
    </ActionButton>,
  );
  t.after(cleanup);
  await act(() => $("button")?.click());
  assert.equal(calls, 0);
  assert.equal($("button")?.getAttribute("aria-busy"), null);
});

it("keeps focus pending and aborts unmounted actions without stale errors", async (t) => {
  let signal: AbortSignal | undefined;
  let rejectAction: ((reason: unknown) => void) | undefined;
  let errors = 0;
  function Fixture(handle: Handle) {
    let visible = true;
    return () => (
      <div>
        {visible && (
          <ActionButton
            action={(details) => {
              signal = details.signal;
              return new Promise<void>((_resolve, reject) => {
                rejectAction = reject;
              });
            }}
            pendingLabel="Waiting"
            onError={() => {
              errors++;
            }}
          >
            Run
          </ActionButton>
        )}
        <button
          id="unmount"
          mix={on("click", () => {
            visible = false;
            handle.update();
          })}
        >
          Remove action
        </button>
      </div>
    );
  }
  const { $, act, cleanup } = render(<Fixture />);
  t.after(cleanup);
  const button = $("button") as HTMLButtonElement;
  button.focus();
  await act(() => button.click());
  assert.equal(document.activeElement, button);
  assert.equal(button.getAttribute("aria-busy"), "true");
  assert.equal(button.disabled, false);
  await act(() => $("#unmount")?.click());
  assert.equal(signal?.aborted, true);
  await act(async () => {
    assert.ok(rejectAction);
    rejectAction(new Error("Late failure"));
    await Promise.resolve();
  });
  assert.equal(errors, 0);
  assert.equal(button.isConnected, false);
  assert.equal($("[aria-busy]"), null);
});

it("reports non-vetoable native method=dialog close to the controlled owner", async (t) => {
  const closes: { reason: string; value: string }[] = [];
  function Fixture(handle: Handle) {
    let open = true;
    return () => (
      <Dialog
        open={open}
        title="Native close fixture"
        onClose={(details) => {
          closes.push(details);
          open = false;
          handle.update();
        }}
      >
        <form method="dialog">
          <button value="confirmed">Confirm</button>
        </form>
      </Dialog>
    );
  }
  const { $, act, cleanup } = render(<Fixture />);
  t.after(cleanup);
  const dialog = $("dialog") as HTMLDialogElement;
  assert.equal(dialog.open, true);
  await act(async () => {
    const closed = new Promise<void>((resolve) => {
      dialog.addEventListener("close", () => resolve(), { once: true });
    });
    $("button")?.click();
    await closed;
  });
  assert.equal(dialog.open, false);
  assert.deepEqual(closes, [{ reason: "native", value: "confirmed" }]);
});
