import type { PhysicalBall } from "./physics.ts";

export const copyPredictedBalls = (balls: PhysicalBall[]): PhysicalBall[] =>
  balls.map((ball) => ({ ...ball, q: [...ball.q], w: [...ball.w] }));

export function predictionDiffers(
  p: PhysicalBall,
  b: Pick<PhysicalBall, "x" | "y" | "z"> & Partial<PhysicalBall>,
): boolean {
  return (
    Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) > 0.025 ||
    Math.hypot(
      p.vx - (b.vx ?? p.vx),
      p.vy - (b.vy ?? p.vy),
      p.vz - (b.vz ?? p.vz),
    ) > 0.2 ||
    (b.pocketed !== undefined && p.pocketed !== b.pocketed) ||
    (b.revision !== undefined && p.revision !== b.revision) ||
    (b.stage !== undefined && p.stage !== b.stage) ||
    (!!b.w && Math.hypot(p.w[0] - b.w[0], p.w[1] - b.w[1], p.w[2] - b.w[2]) > 1)
  );
}
