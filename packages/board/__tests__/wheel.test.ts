import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { wheelNavigation } from "../wheel.ts";

const viewport = { width: 800, height: 600 };
const wheel = {
  deltaX: 0,
  deltaY: 3,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

describe("board wheel navigation", () => {
  it("zooms ordinary wheel input by default", () => {
    assert.deepEqual(wheelNavigation({ ...wheel, deltaY: 100 }, viewport), {
      kind: "zoom",
      factor: Math.exp(-0.24),
    });
  });

  it("pans horizontal-only input even in zoom mode", () => {
    assert.deepEqual(
      wheelNavigation({ ...wheel, deltaX: -6, deltaY: 0 }, viewport, "zoom"),
      { kind: "pan", x: -6, y: 0 },
    );
  });

  it("preserves fractional two-axis trackpad movement", () => {
    assert.deepEqual(
      wheelNavigation(
        { ...wheel, deltaX: 2.5, deltaY: -0.75 },
        viewport,
        "pan",
      ),
      {
        kind: "pan",
        x: 2.5,
        y: -0.75,
      },
    );
  });

  it("normalizes mouse wheel lines and pages in each viewport axis", () => {
    assert.deepEqual(
      wheelNavigation({ ...wheel, deltaX: -2, deltaMode: 1 }, viewport, "pan"),
      {
        kind: "pan",
        x: -32,
        y: 48,
      },
    );
    assert.deepEqual(
      wheelNavigation(
        { ...wheel, deltaX: -1, deltaY: 1, deltaMode: 2 },
        viewport,
        "pan",
      ),
      {
        kind: "pan",
        x: -800,
        y: 600,
      },
    );
  });

  it("pans horizontally with Shift without remapping native horizontal events", () => {
    assert.deepEqual(wheelNavigation({ ...wheel, shiftKey: true }, viewport), {
      kind: "pan",
      x: 3,
      y: 0,
    });
    assert.deepEqual(
      wheelNavigation({ ...wheel, shiftKey: true }, viewport, "pan"),
      {
        kind: "pan",
        x: 3,
        y: 0,
      },
    );
    assert.deepEqual(
      wheelNavigation(
        { ...wheel, shiftKey: true, deltaX: 3, deltaY: 0 },
        viewport,
        "pan",
      ),
      {
        kind: "pan",
        x: 3,
        y: 0,
      },
    );
  });

  it("bounds coarse mouse notches and page zoom while preserving reciprocal direction", () => {
    const out = wheelNavigation(
      { ...wheel, ctrlKey: true, deltaY: 100 },
      viewport,
    );
    const inward = wheelNavigation(
      { ...wheel, ctrlKey: true, deltaY: -1, deltaMode: 2 },
      viewport,
    );
    assert.deepEqual(out, { kind: "zoom", factor: Math.exp(-0.24) });
    assert.deepEqual(inward, { kind: "zoom", factor: Math.exp(0.24) });
  });

  for (const modifier of ["ctrlKey", "metaKey"] as const)
    it(`zooms with ${modifier} before applying Shift`, () => {
      assert.deepEqual(
        wheelNavigation(
          { ...wheel, [modifier]: true, shiftKey: true },
          viewport,
          "pan",
        ),
        {
          kind: "zoom",
          factor: Math.exp(-0.03),
        },
      );
      assert.deepEqual(
        wheelNavigation(
          { ...wheel, [modifier]: true, deltaY: -3, deltaMode: 1 },
          viewport,
          "pan",
        ),
        { kind: "zoom", factor: Math.exp(0.24) },
      );
    });
});
