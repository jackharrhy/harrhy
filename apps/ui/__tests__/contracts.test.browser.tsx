import * as assert from "remix/assert";
import { on, type Handle } from "remix/component";
import { render } from "remix/component/test";
import { it } from "remix/test";
import { ActionButton, Dialog, Select } from "@harrhy/ui/interactive";
import { Field } from "@harrhy/ui/native";

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

it("composes Select keyboard, Field relationships and form participation", async (t) => {
  const changes: string[] = [];
  const options = [
    { value: "alpha", label: "Alpha" },
    { value: "blocked", label: "Unavailable", disabled: true },
    { value: "gamma", label: "Gamma" },
  ];
  const { $, act, cleanup } = render(
    <form>
      <span id="external">External hint</span>
      <Field
        id="choice"
        label="Choice"
        description="Pick one"
        error="Check choice"
      >
        <Select
          options={options}
          defaultValue="alpha"
          name="choice"
          aria-describedby="external"
          onValueChange={(value) => changes.push(value)}
        />
      </Field>
      <Select
        aria-label="Disabled choice"
        options={options}
        defaultValue="alpha"
        name="disabled-choice"
        disabled
      />
    </form>,
  );
  t.after(cleanup);
  const trigger = $("#choice") as HTMLButtonElement;
  const form = $("form") as HTMLFormElement;
  assert.equal($("select"), null);
  assert.equal($("label")?.getAttribute("for"), "choice");
  assert.equal(trigger.getAttribute("aria-invalid"), "true");
  const described = trigger.getAttribute("aria-describedby")?.split(" ") ?? [];
  for (const id of ["external", "choice-description", "choice-error"]) {
    assert.ok(described.includes(id));
    assert.ok(document.getElementById(id));
  }
  assert.deepEqual(Array.from(new FormData(form)), [["choice", "alpha"]]);
  assert.equal(
    ($('[aria-label="Disabled choice"]') as HTMLButtonElement).disabled,
    true,
  );
  trigger.focus();
  await act(() => dispatchKey(trigger, "ArrowDown"));
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(
    $('[role="option"][aria-disabled="true"]')?.textContent,
    "Unavailable",
  );
  const list = $('[role="listbox"]')!;
  await act(async () => {
    const deadline = performance.now() + 3000;
    while (document.activeElement !== list && performance.now() < deadline) {
      await new Promise(requestAnimationFrame);
    }
  });
  assert.equal(document.activeElement, list);
  await act(() => $('[role="option"][aria-disabled="true"]')?.click());
  assert.deepEqual(changes, []);
  assert.deepEqual(Array.from(new FormData(form)), [["choice", "alpha"]]);
  await act(() => dispatchKey(list, "Home"));
  await act(() => dispatchKey(list, "ArrowDown"));
  await act(async () => {
    dispatchKey(document.activeElement!, "Enter");
    const deadline = performance.now() + 3000;
    while (changes.length === 0 && performance.now() < deadline) {
      await new Promise(requestAnimationFrame);
    }
  });
  assert.deepEqual(changes, ["gamma"]);
  assert.deepEqual(Array.from(new FormData(form)), [["choice", "gamma"]]);
  assert.equal(trigger.textContent?.trim(), "Gamma");
  await act(() => dispatchKey(trigger, "ArrowDown"));
  await act(async () => {
    const deadline = performance.now() + 3000;
    while (document.activeElement !== list && performance.now() < deadline) {
      await new Promise(requestAnimationFrame);
    }
  });
  await act(async () => {
    dispatchKey(list, "Escape");
    const deadline = performance.now() + 3000;
    while (
      trigger.getAttribute("aria-expanded") !== "false" &&
      performance.now() < deadline
    ) {
      await new Promise(requestAnimationFrame);
    }
  });
  assert.equal(document.activeElement, trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
});

const dispatchKey = (node: Element, value: string) =>
  node.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: value,
      bubbles: true,
      cancelable: true,
    }),
  );
