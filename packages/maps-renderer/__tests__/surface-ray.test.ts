import { expect, it } from "vitest";
import {
  parseBsp,
  raycastBspSurfaces,
  type Vec3Tuple,
} from "../src/core/index.js";
import { makeBsp } from "./fixtures.js";

it("picks the nearest eligible triangle within the distance interval, from either side", () => {
  const [face] = parseBsp(makeBsp({ version: 30 })).faces;
  const far = { ...face!, firstIndex: 0, indexCount: 3 };
  const near = { ...far, firstIndex: 3 };
  const vertices = new Float32Array(
    [0, 4].flatMap((z) => [
      0,
      0,
      z,
      0,
      0,
      0,
      0,
      8,
      0,
      z,
      0,
      0,
      0,
      0,
      0,
      8,
      z,
      0,
      0,
      0,
      0,
    ]),
  );
  const geometry = { vertices, indices: new Uint32Array([0, 1, 2, 3, 5, 4]) };
  const down = [0, 0, -1] as const;
  const origin = [2, 2, 6] as const;
  const faces = [far, near];
  const hit = raycastBspSurfaces(geometry, faces, origin, down);
  expect(hit?.face).toBe(near);
  expect(hit?.distance).toBe(2);
  expect(hit?.point).toEqual([2, 2, 4]);
  expect(hit?.normal[2]).toBe(1);
  expect(raycastBspSurfaces(geometry, faces, origin, down, 3, 6)?.face).toBe(
    far,
  );
  expect(raycastBspSurfaces(geometry, [far], origin, down)?.face).toBe(far);
  expect(
    raycastBspSurfaces(geometry, faces, origin, down, 0, 1),
  ).toBeUndefined();
  expect(raycastBspSurfaces(geometry, faces, [7, 7, 6], down)).toBeUndefined();
  expect(
    raycastBspSurfaces(geometry, faces, origin, [1, 0, 0]),
  ).toBeUndefined();
  const diagonal: Vec3Tuple = [Math.SQRT1_2, 0, Math.SQRT1_2];
  expect(
    raycastBspSurfaces(geometry, faces, [0, 2, -2], diagonal)?.point,
  ).toEqual([2, 2, 0]);
  expect(
    raycastBspSurfaces(geometry, faces, [2, 2, -1], [0, 0, 1])?.normal[2],
  ).toBe(-1);
});
