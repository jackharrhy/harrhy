import assert from "node:assert/strict";

// Count calls in the actual served browser bundle, without counters in the UI. V8 merges
// closures from the same source range, so row counts cover *all* mounted SessionRow renders.
export async function measureRenders(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Debugger.enable");
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.startPreciseCoverage", {
    callCount: true,
    detailed: false,
  });
  async function script() {
    const { result } = await cdp.send("Profiler.takePreciseCoverage");
    return result.find((s) => s.url.endsWith("/sessions.js"));
  }
  return async function startInterval() {
    const baseline = await script();
    const { scriptSource } = await cdp.send("Debugger.getScriptSource", {
      scriptId: baseline.scriptId,
    });
    const labels = {
      row: "Untitled session",
      list: "Sessions in activity order",
      connection: "Fixture connection",
    };
    const offsets = {};
    for (const [name, label] of Object.entries(labels)) {
      const at = scriptSource.indexOf(label);
      assert.notEqual(at, -1);
      assert.equal(at, scriptSource.lastIndexOf(label));
      const ranges = baseline.functions
        .map((f) => f.ranges[0])
        .filter((r) => r.startOffset <= at && at < r.endOffset);
      const render = ranges.toSorted(
        (a, b) => b.startOffset - a.startOffset,
      )[0];
      assert.ok(
        render?.count > 0 && render.startOffset > 0,
        `Unmeasured ${name} render`,
      );
      offsets[name] = render.startOffset;
    }
    return async () => {
      const sample = await script();
      const count = Object.fromEntries(
        Object.entries(offsets).map(([name, start]) => [
          name,
          sample?.functions.find((f) => f.ranges[0].startOffset === start)
            ?.ranges[0].count ?? 0,
        ]),
      );
      await cdp.detach();
      return count;
    };
  };
}
