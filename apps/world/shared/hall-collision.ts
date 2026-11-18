import { BAR, HALL, STOOLS } from "@harrhy/pool-simulation/geometry";
import type { GoldSrcHullSweep } from "@harrhy/schmovement";
import { SURF_RAMP } from "./surf-ramp";

type Vec3 = readonly [number, number, number];
type Plane = { normal: Vec3; distance: number };

// GoldSrc x/y/z correspond to World -z/-x/y; both live in metres here.
const radius = 0.35;
export const HALF_HEIGHT = 0.9;
export const UNITS_PER_METRE = 60;
const EPSILON = 1e-8;
const hallX = HALL.x - 0.4;
const hallZ = HALL.z - 0.4;

function plane(normal: Vec3, distance: number): Plane {
  // Expand each solid by the standing hull so the player centre is a point.
  return {
    normal,
    distance:
      distance +
      (Math.abs(normal[0]) + Math.abs(normal[1])) * radius +
      Math.abs(normal[2]) * HALF_HEIGHT,
  };
}

function box(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
) {
  return [
    plane([1, 0, 0], -minZ),
    plane([-1, 0, 0], maxZ),
    plane([0, 1, 0], -minX),
    plane([0, -1, 0], maxX),
    plane([0, 0, 1], maxY),
    plane([0, 0, -1], -minY),
  ];
}

const { highX, lowX, height, minZ, maxZ } = SURF_RAMP;
const rise = height / (lowX - highX);
const slopeLength = Math.hypot(rise, 1);
const solids = [
  [plane([0, 0, 1], 0)],
  [plane([1, 0, 0], -hallZ)],
  [plane([-1, 0, 0], -hallZ)],
  [plane([0, 1, 0], -hallX)],
  [plane([0, -1, 0], -hallX)],
  box(
    BAR.x - BAR.width / 2 - 0.1,
    BAR.x + BAR.width / 2 + 0.1,
    0,
    BAR.height + 0.05,
    BAR.z - BAR.depth / 2 - 0.1,
    BAR.z + BAR.depth / 2 + 0.1,
  ),
  ...STOOLS.map(({ x, y, z }) =>
    box(x - 0.25, x + 0.25, 0, y, z - 0.25, z + 0.25),
  ),
  [
    ...box(highX, lowX, 0, height, minZ, maxZ),
    plane(
      [0, -rise / slopeLength, 1 / slopeLength],
      (rise * lowX) / slopeLength,
    ),
  ],
];

function signedDistance(point: Vec3, { normal, distance }: Plane) {
  return (
    (point[0] * normal[0] + point[1] * normal[1] + point[2] * normal[2]) /
      UNITS_PER_METRE -
    distance
  );
}

export const sweepHall: GoldSrcHullSweep = (start, end) => {
  let fraction = 1;
  let planeNormal: Vec3 = [0, 0, 0];
  let startSolid = false;
  let allSolid = false;
  for (const solid of solids) {
    let enter = -Infinity;
    let exit = Infinity;
    let enteringPlane: Plane | undefined;
    for (const face of solid) {
      const from = signedDistance(start, face);
      const to = signedDistance(end, face);
      const delta = to - from;
      if (Math.abs(delta) < EPSILON) {
        // A segment tangent to a face never enters the solid interior.
        if (from >= -EPSILON) {
          exit = -Infinity;
          break;
        }
      } else if (delta < 0) {
        const hit = -from / delta;
        if (hit > enter) {
          enter = hit;
          enteringPlane = face;
        }
      } else {
        exit = Math.min(exit, -from / delta);
      }
    }
    if (exit <= Math.max(0, enter)) continue;
    if (enter < -EPSILON) {
      startSolid = true;
      if (exit >= 1) allSolid = true;
    } else if (enter < fraction && enteringPlane) {
      fraction = Math.max(0, enter);
      planeNormal = enteringPlane.normal;
    }
  }
  return {
    fraction,
    endPosition: [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
      start[2] + (end[2] - start[2]) * fraction,
    ],
    planeNormal,
    startSolid,
    allSolid,
  };
};
