import assert from "node:assert/strict";
import { test } from "node:test";
import { registerWebMcpTools, type WebMcpTool } from "../src/index.ts";

function browser(
  registerTool: (
    tool: WebMcpTool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>,
) {
  const view = new EventTarget();
  const document = {
    defaultView: view,
    modelContext: { registerTool },
  } as unknown as Document;
  return { document, view };
}

const tool: WebMcpTool = {
  name: "inspect",
  description: "Inspect a synthetic document",
  execute: () => ({ ok: true }),
};

test("unsupported documents need no browser globals", async () => {
  const registration = registerWebMcpTools({} as Document, [tool]);
  assert.equal(registration.supported, false);
  await registration.ready;
  registration.dispose();
});

test("pagehide aborts registrations and retained callbacks fail closed", async () => {
  let registered: WebMcpTool | undefined;
  let signal: AbortSignal | undefined;
  const { document, view } = browser((entry, options) => {
    registered = entry;
    signal = options.signal;
  });
  const registration = registerWebMcpTools(document, [tool]);
  await registration.ready;
  assert.deepEqual(
    await registered!.execute({}, { signal: new AbortController().signal }),
    { ok: true },
  );
  view.dispatchEvent(new Event("pagehide"));
  assert.equal(signal!.aborted, true);
  assert.throws(
    () => registered!.execute({}, { signal: new AbortController().signal }),
    { name: "AbortError" },
  );
});

test("a failed registration aborts every partial registration", async () => {
  const signals: AbortSignal[] = [];
  const { document } = browser((entry, options) => {
    signals.push(options.signal);
    if (entry.name === "broken") throw new Error("rejected by browser");
  });
  const registration = registerWebMcpTools(document, [
    tool,
    { ...tool, name: "broken" },
  ]);
  await assert.rejects(registration.ready, /WebMCP tool registration failed/);
  assert.ok(signals.length > 0);
  assert.ok(signals.every((signal) => signal.aborted));
});

test("caller cancellation before readiness aborts pending registration", async () => {
  let finish!: () => void;
  let signal!: AbortSignal;
  const { document } = browser((_entry, options) => {
    signal = options.signal;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const controller = new AbortController();
  const registration = registerWebMcpTools(document, [tool], {
    signal: controller.signal,
  });
  controller.abort();
  finish();
  await assert.rejects(registration.ready);
  assert.equal(signal.aborted, true);
});

test("invocations receive cancellation from both the browser and registration", async () => {
  let registered!: WebMcpTool;
  let observed!: AbortSignal;
  const { document } = browser((entry) => {
    registered = entry;
  });
  const registration = registerWebMcpTools(document, [
    {
      ...tool,
      execute(_input, context) {
        observed = context.signal;
      },
    },
  ]);
  await registration.ready;
  const invocation = new AbortController();
  registered.execute({}, { signal: invocation.signal });
  invocation.abort();
  assert.equal(observed.aborted, true);
  registered.execute({}, { signal: new AbortController().signal });
  registration.dispose();
  assert.equal(observed.aborted, true);
});
