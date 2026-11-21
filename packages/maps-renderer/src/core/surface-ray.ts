import type { ParsedFace, ParsedWorld, Vec3Tuple } from "./types.js";

export const BSP_VERTEX_STRIDE = 7;
type SurfaceGeometry = Pick<ParsedWorld, "vertices" | "indices">;

function dot(a: Vec3Tuple, b: Vec3Tuple) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function surfaceVertex(world: SurfaceGeometry, indexOffset: number) {
  const index = world.indices[indexOffset];
  if (index === undefined) return undefined;
  const offset = index * BSP_VERTEX_STRIDE;
  if (offset + BSP_VERTEX_STRIDE > world.vertices.length) return undefined;
  return world.vertices.subarray(offset, offset + BSP_VERTEX_STRIDE);
}

function difference(a: Float32Array, b: Float32Array): Vec3Tuple {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
}

export function rayTriangleDistance(
  world: SurfaceGeometry,
  indexOffset: number,
  origin: Vec3Tuple,
  direction: Vec3Tuple,
  minimumDistance: number,
  maximumDistance: number,
): number | undefined {
  const first = surfaceVertex(world, indexOffset);
  const second = surfaceVertex(world, indexOffset + 1);
  const third = surfaceVertex(world, indexOffset + 2);
  if (!first || !second || !third) return undefined;
  const edge1 = difference(second, first);
  const edge2 = difference(third, first);
  const p = cross(direction, edge2);
  const determinant = dot(edge1, p);
  if (Math.abs(determinant) < 0.000_001) return undefined;
  const inverse = 1 / determinant;
  const fromFirst = [
    origin[0] - first[0]!,
    origin[1] - first[1]!,
    origin[2] - first[2]!,
  ] as const;
  const u = dot(fromFirst, p) * inverse;
  if (u < 0 || u > 1) return undefined;
  const q = cross(fromFirst, edge1);
  const v = dot(direction, q) * inverse;
  if (v < 0 || u + v > 1) return undefined;
  const distance = dot(edge2, q) * inverse;
  return distance >= minimumDistance && distance <= maximumDistance
    ? distance
    : undefined;
}

export interface BspSurfaceHit {
  readonly face: ParsedFace;
  readonly distance: number;
  readonly point: Vec3Tuple;
  /** Unit normal oriented against the ray, regardless of triangle winding. */
  readonly normal: Vec3Tuple;
}

/** Pick double-sided render geometry, not collision hulls. Origin and distances
 * are in BSP units; direction must be unit length. The caller selects eligible faces. */
export function raycastBspSurfaces(
  world: SurfaceGeometry,
  faces: readonly ParsedFace[],
  origin: Vec3Tuple,
  direction: Vec3Tuple,
  minimumDistance = 0,
  maximumDistance = Infinity,
): BspSurfaceHit | undefined {
  let closest:
    | { face: ParsedFace; index: number; distance: number }
    | undefined;
  for (const face of faces) {
    const end = face.firstIndex + face.indexCount;
    for (let index = face.firstIndex; index + 2 < end; index += 3) {
      const distance = rayTriangleDistance(
        world,
        index,
        origin,
        direction,
        minimumDistance,
        closest?.distance ?? maximumDistance,
      );
      if (distance !== undefined && (!closest || distance < closest.distance)) {
        closest = { face, index, distance };
      }
    }
  }
  if (!closest) return undefined;
  const { face, index, distance } = closest;
  const a = surfaceVertex(world, index)!;
  const b = surfaceVertex(world, index + 1)!;
  const c = surfaceVertex(world, index + 2)!;
  const normal = cross(difference(b, a), difference(c, a));
  const factor = (dot(normal, direction) > 0 ? -1 : 1) / Math.hypot(...normal);
  return {
    face,
    distance,
    point: [
      origin[0] + direction[0] * distance,
      origin[1] + direction[1] * distance,
      origin[2] + direction[2] * distance,
    ],
    normal: [normal[0] * factor, normal[1] * factor, normal[2] * factor],
  };
}
