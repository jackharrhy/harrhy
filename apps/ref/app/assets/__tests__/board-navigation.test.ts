import { describe, expect, it } from "vitest";
import { wheelNavigation } from "../board-navigation.ts";

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
    expect(wheelNavigation({ ...wheel, deltaY: 100 }, viewport)).toEqual({
      kind: "zoom",
      factor: Math.exp(-0.24),
    });
  });

  it("pans horizontal-only input even in zoom mode", () => {
    expect(
      wheelNavigation({ ...wheel, deltaX: -6, deltaY: 0 }, viewport, "zoom"),
    ).toEqual({ kind: "pan", x: -6, y: 0 });
  });

  it("preserves fractional two-axis trackpad movement", () => {
    expect(
      wheelNavigation(
        { ...wheel, deltaX: 2.5, deltaY: -0.75 },
        viewport,
        "pan",
      ),
    ).toEqual({
      kind: "pan",
      x: 2.5,
      y: -0.75,
    });
  });

  it("normalizes mouse wheel lines and pages in each viewport axis", () => {
    expect(
      wheelNavigation({ ...wheel, deltaX: -2, deltaMode: 1 }, viewport, "pan"),
    ).toEqual({
      kind: "pan",
      x: -32,
      y: 48,
    });
    expect(
      wheelNavigation(
        { ...wheel, deltaX: -1, deltaY: 1, deltaMode: 2 },
        viewport,
        "pan",
      ),
    ).toEqual({
      kind: "pan",
      x: -800,
      y: 600,
    });
  });

  it("pans horizontally with Shift without remapping native horizontal events", () => {
    expect(wheelNavigation({ ...wheel, shiftKey: true }, viewport)).toEqual({
      kind: "pan",
      x: 3,
      y: 0,
    });
    expect(
      wheelNavigation({ ...wheel, shiftKey: true }, viewport, "pan"),
    ).toEqual({
      kind: "pan",
      x: 3,
      y: 0,
    });
    expect(
      wheelNavigation(
        { ...wheel, shiftKey: true, deltaX: 3, deltaY: 0 },
        viewport,
        "pan",
      ),
    ).toEqual({
      kind: "pan",
      x: 3,
      y: 0,
    });
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
    expect(out).toEqual({ kind: "zoom", factor: Math.exp(-0.24) });
    expect(inward).toEqual({ kind: "zoom", factor: Math.exp(0.24) });
  });

  it.each(["ctrlKey", "metaKey"] as const)(
    "zooms with %s, including pinch, before applying Shift",
    (modifier) => {
      expect(
        wheelNavigation(
          { ...wheel, [modifier]: true, shiftKey: true },
          viewport,
          "pan",
        ),
      ).toEqual({
        kind: "zoom",
        factor: Math.exp(-0.03),
      });
      expect(
        wheelNavigation(
          { ...wheel, [modifier]: true, deltaY: -3, deltaMode: 1 },
          viewport,
          "pan",
        ),
      ).toEqual({ kind: "zoom", factor: Math.exp(0.24) });
    },
  );
});
