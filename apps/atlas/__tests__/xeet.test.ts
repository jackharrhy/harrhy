import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createWidgetLoader } from "../app/widgets.ts";

test("Xeet import requires the exact explicit capability without opening other imports", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-xeet-capability-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = path.join(root, "widgets.json");
  const base = { id: "card", space: "alpha", page: "/example/", module: "card.tsx" };
  const load = createWidgetLoader(manifest);
  const save = (capabilities?: unknown) =>
    writeFile(
      manifest,
      JSON.stringify({
        trust: "tailnet-owner-temporary",
        root,
        widgets: [{ ...base, ...(capabilities === undefined ? {} : { capabilities }) }],
      }),
    );
  await writeFile(
    path.join(root, "card.tsx"),
    'import {createRenderer} from "@atlas/xeet"; export function Widget(handle){const renderer=createRenderer(handle.signal);return ()=> <button onClick={()=>renderer.dispose()}>Dispose</button>}',
  );
  await save();
  await assert.rejects(load(), /Invalid trusted widgets/);
  await save(["xeet"]);
  const [widget] = await load();
  assert.deepEqual(widget.capabilities, ["xeet"]);
  assert.match(widget.script, /xeet-worker/);
  for (const capability of [[], ["other"], ["xeet", "xeet"], "xeet", null]) {
    await save(capability);
    await assert.rejects(load(), /Invalid trusted widgets/);
  }
  for (const dependency of [
    "node:fs",
    "https://example.com/code.js",
    "@xeet/core",
    "./local.ts",
    "@atlas/xeet/worker",
  ]) {
    await writeFile(
      path.join(root, "card.tsx"),
      `import { x } from ${JSON.stringify(dependency)}; export function Widget(){return ()=> <p>{x}</p>}`,
    );
    await save(["xeet"]);
    await assert.rejects(load(), /Invalid trusted widgets/);
  }
});

test("renderer avoids aborted workers, releases cloning failures and disposes on abort", async () => {
  const { createRenderer } = await import("../app/xeet/client.ts");
  const priorWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let constructed = 0, terminated = 0;
  function FakeWorker() {
    constructed++;
    return { terminate() { terminated++; }, postMessage() { throw new Error("clone failed"); }, onmessage: null, onerror: null };
  }
  Object.defineProperty(globalThis, "Worker", { value: FakeWorker, configurable: true });
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  try {
    assert.throws(() => createRenderer(AbortSignal.abort()), /disposed/);
    assert.equal(constructed, 0);
    const controller = new AbortController();
    const renderer = createRenderer(controller.signal);
    const snapshot = { text: "test", author: { name: "Example", handle: "example" }, publishedAt: "2026-01-01", capturedAt: "2026-01-01", media: [] };
    const options = { theme: "light", surface: "web-detail", width: 600, dpr: 1 } as const;
    await assert.rejects(renderer.render(snapshot, options), /clone failed/);
    await assert.rejects(renderer.render(snapshot, options), /clone failed/);
    controller.abort();
    assert.equal(terminated, 1);
    await assert.rejects(renderer.render(snapshot, options), /disposed/);
  } finally {
    if (priorWorker) Object.defineProperty(globalThis, "Worker", priorWorker);
    else Reflect.deleteProperty(globalThis, "Worker");
    if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
