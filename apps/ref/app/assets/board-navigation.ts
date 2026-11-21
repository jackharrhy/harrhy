interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function wheelNavigation(
  event: WheelInput,
  viewport: { width: number; height: number },
  mode: "zoom" | "pan" = "zoom",
): { kind: "zoom"; factor: number } | { kind: "pan"; x: number; y: number } {
  const xUnit =
    event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.width : 1;
  const yUnit =
    event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
  const x = event.deltaX * xUnit;
  const y = event.deltaY * yUnit;
  if (
    y !== 0 &&
    (event.ctrlKey || event.metaKey || (mode === "zoom" && !event.shiftKey))
  ) {
    // Preserve small pinch deltas, but limit coarse wheel notches to a 27% step.
    const delta = Math.max(-24, Math.min(24, y));
    return { kind: "zoom", factor: Math.exp(-delta * 0.01) };
  }
  // Some browsers already translate Shift+wheel to deltaX.
  return event.shiftKey && x === 0
    ? { kind: "pan", x: y, y: 0 }
    : { kind: "pan", x, y };
}
