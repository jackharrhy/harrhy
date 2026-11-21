import type { PhysicalBall, PoolSound } from "../physics";
import { FELT_Y, MESH_REST_OFFSET, FELT_LIP_DROP } from "../physical-table";

import { isReturnFloorLanding } from "./surfaces";

export const MAX_VOICES = 32;
export const MAX_IMPACT_VOICES = 24;
export const MAX_ROLLING_VOICES = 8;
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

// Native felt hits share the cushion kind. Use contact height, not ball-center height.
export function isFeltLanding(sound: PoolSound) {
  return (
    sound.kind === "cushion" &&
    sound.y >= FELT_Y - MESH_REST_OFFSET - FELT_LIP_DROP &&
    sound.y <= FELT_Y + MESH_REST_OFFSET
  );
}

export function impactMix(sound: PoolSound) {
  const speed = Number.isFinite(sound.speed) ? clamp(sound.speed, 0, 6) : 0;
  const surface = isFeltLanding(sound)
    ? "felt"
    : isReturnFloorLanding(sound)
      ? "floor"
      : sound.kind;
  const { scale, rate, cutoff } = {
    cue: { scale: 0.65, rate: 0.97, cutoff: 14000 },
    ball: { scale: 0.8, rate: 0.97, cutoff: 14000 },
    cushion: { scale: 0.24, rate: 1.08, cutoff: 1800 },
    pocket: { scale: 0.38, rate: 0.62, cutoff: 900 },
    return: { scale: 0.028, rate: 0.72, cutoff: 800 },
    floor: { scale: 0.48, rate: 0.52, cutoff: 650 },
    felt: { scale: 0.1, rate: 0.9, cutoff: 700 },
  }[surface];
  return {
    sample: surface === "ball" ? "impact" : surface,
    gain:
      speed < 0.035
        ? 0
        : scale *
          (sound.kind === "ball"
            ? clamp((speed - 0.035) / 4, 0, 1) ** 1.5
            : 1 - Math.exp(-speed * 0.75)),
    rate: rate + Math.min(speed, 5) * 0.035,
    cutoff:
      surface === "ball"
        ? 2800 + Math.min(speed / 4, 1) * 11200
        : surface === "cue"
          ? 1800 + Math.min(speed / 4, 1) * 10200
          : cutoff,
  };
}

export function rollingMix(
  ball: Pick<PhysicalBall, "vx" | "vy" | "vz" | "stage">,
) {
  const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const cabinet = ball.stage === "return";
  const moving =
    (ball.stage === "table" || cabinet) &&
    Number.isFinite(speed) &&
    speed > 0.045;
  return {
    sample: cabinet ? ("cabinet" as const) : ("felt" as const),
    gain: moving
      ? Math.min(speed / 1.5, 1) ** 0.8 * (cabinet ? 0.12 : 0.075)
      : 0,
    rate: Number.isFinite(speed) ? clamp(0.75 + speed * 0.2, 0.75, 1.5) : 0.75,
    cutoff: cabinet ? 1100 : 750,
  };
}

// Both branches share distance loss; the centered signal must not carry across the hall.
export function spatialMix(distance: number) {
  const attenuation = Number.isFinite(distance)
    ? 1 / (1 + 1.3 * (clamp(distance, 1, 30) - 1))
    : 0;
  return { dry: attenuation * 0.75, spatial: attenuation * 0.25 };
}
