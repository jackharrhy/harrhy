import type { Handle } from "remix/component";
import { radioStyle } from "./styles.ts";

const PREVIEW_HALF = Array.from({ length: 24 }, (_, index) => {
  return (
    15 + Math.abs(Math.sin(index * 0.63 + 0.8) * Math.cos(index * 0.21)) * 74
  );
});
const PREVIEW_BARS = [...PREVIEW_HALF.toReversed(), ...PREVIEW_HALF];

export function AudioVisualizerPreview(
  handle: Handle<{ hasTrack: boolean; playing: boolean }>,
) {
  return () => (
    <svg
      aria-hidden="true"
      mix={radioStyle.audioVisualizer}
      preserveAspectRatio="none"
      viewBox="0 0 1000 120"
    >
      {handle.props.hasTrack ? (
        <g fill="currentColor" opacity={handle.props.playing ? "0.2" : "0.14"}>
          {PREVIEW_BARS.map((height, index) => (
            <rect
              height={String(height)}
              key={String(index)}
              rx="6"
              width="12"
              x={String(20 + index * 20)}
              y={String((120 - height) / 2)}
            />
          ))}
        </g>
      ) : (
        <>
          <path
            d="M0 60 C100 60 120 29 225 29 S380 91 500 91 S655 29 775 29 S900 60 1000 60"
            fill="none"
            opacity="0.62"
            stroke="currentColor"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
          <path
            d="M0 60 C130 60 150 42 270 42 S410 78 525 78 S680 42 790 42 S910 60 1000 60"
            fill="none"
            opacity="0.22"
            stroke="currentColor"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}
