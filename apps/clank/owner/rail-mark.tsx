import { css, type Handle } from "remix/component";

// Same frames and bit order as P2's PiDots; draw physical cells, not glyphs.
const positions = [
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 1],
  [2, 2],
  [2, 3],
  [1, 4],
  [2, 4],
] as const;
const frames = Array.from("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏", (frame) => {
  const bits = frame.charCodeAt(0) - 0x2800;
  return positions.filter((_, bit) => bits & (1 << bit));
});

const dots = css({
  display: "inline-block",
  flex: "none",
  width: "16px",
  height: "16px",
  overflow: "hidden",
  direction: "ltr",
  // Elanor's pi.css: icon-secondary → graphite-600 / graphite-300.
  color: "light-dark(oklch(48.15% 0 0), oklch(74.2% 0 0))",
  "& .rail-dots-strip": {
    display: "flex",
    width: "160px",
    animation: "clank-rail-dots 1600ms steps(10) infinite",
  },
  "@keyframes clank-rail-dots": { to: { transform: "translateX(-160px)" } },
  "& .rail-dots-strip > span": {
    display: "grid",
    flex: "none",
    width: "16px",
    height: "16px",
    gridTemplate: "repeat(4, 2px) / repeat(2, 2px)",
    gap: "2px",
    placeContent: "end center",
  },
  "& i": { background: "currentColor", borderRadius: "50%" },
  "@media (forced-colors: active)": {
    "& i": { background: "CanvasText", forcedColorAdjust: "none" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    "& .rail-dots-strip": { animation: "none" },
  },
});

export function WorkingDots() {
  // A late-mounted row joins the page clock without a timer or DOM updates per frame.
  const delay =
    typeof document === "undefined"
      ? "0ms"
      : `${-(performance.now() % 1600)}ms`;
  return () => (
    <span
      data-rail-mark="working"
      title="Working"
      aria-hidden="true"
      mix={dots}
    >
      <span class="rail-dots-strip" style={{ animationDelay: delay }}>
        {frames.map((frame, index) => (
          <span key={index}>
            {frame.map(([column, row]) => (
              <i
                key={`${column}-${row}`}
                style={{ gridColumn: column, gridRow: row }}
              />
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}

const dot = css({
  display: "inline-block",
  flex: "none",
  height: "8px",
  width: "8px",
  borderRadius: "50%",
  background: "light-dark(#2f7de1, #5b9cf0)",
  "&[data-rail-mark=failed]": { background: "light-dark(#c8433d, #f07a72)" },
  "@media (forced-colors: active)": { forcedColorAdjust: "none" },
});

export function AnswerDot(handle: Handle<{ failure?: string }>) {
  return () => (
    <span
      data-rail-mark={handle.props.failure === undefined ? "unread" : "failed"}
      aria-hidden="true"
      title={handle.props.failure ?? "New answer"}
      mix={dot}
    />
  );
}

const frame = css({
  position: "absolute",
  inset: "-3px",
  width: "22px",
  height: "22px",
  overflow: "visible",
  pointerEvents: "none",
  color: "light-dark(#e8820c, #f59e42)",
  "& .track": { stroke: "color-mix(in srgb, currentColor 26%, transparent)" },
  "& .dash": {
    strokeDasharray: "32 68",
    animation: "clank-rail-frame 1.5s linear infinite",
  },
  "@keyframes clank-rail-frame": { to: { strokeDashoffset: "-100" } },
  "@media (prefers-reduced-motion: reduce)": {
    "& .track": { stroke: "none" },
    "& .dash": { strokeDasharray: "7 5.5", animation: "none" },
  },
});
const outline = {
  x: 0.75,
  y: 0.75,
  width: 20.5,
  height: 20.5,
  rx: 5.5,
  pathLength: 100,
} as const;

export function WorkingFrame() {
  return () => (
    <svg
      data-rail-mark="frame"
      aria-hidden="true"
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      mix={frame}
    >
      <rect class="track" {...outline} />
      <rect class="dash" {...outline} />
    </svg>
  );
}
