import * as THREE from "three/webgpu";
import {
  BSP_VERTEX_STRIDE,
  raycastBspSurfaces,
  type ParsedWorld,
  type Vec3Tuple,
} from "@harrhy/worldview-renderer/core";
import { UNITS_PER_METRE as scale } from "../shared/bsp-collision.ts";

export function bspPosition({
  x,
  y,
  z,
}: {
  x: number;
  y: number;
  z: number;
}): [number, number, number] {
  return [-z * scale, -x * scale, y * scale];
}

// BSP [x,y,z] -> Three/World metres [-y,z,-x].
export const bspToWorld = new THREE.Matrix4().set(
  0,
  -1 / scale,
  0,
  0,
  0,
  0,
  1 / scale,
  0,
  -1 / scale,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
);

function worldPosition([x, y, z]: Vec3Tuple, units: number) {
  return new THREE.Vector3(-y / units, z / units, -x / units);
}

export function createHallSurfaces(
  world: Pick<ParsedWorld, "vertices" | "indices" | "faces" | "models">,
) {
  // Use the same face policy for the depth prepass and CPU picking.
  const faces = world.faces.filter(
    (face) =>
      world.models[face.modelIndex]?.visible &&
      face.kind !== "tool" &&
      face.kind !== "sky",
  );
  const positions = new Float32Array(
    (world.vertices.length / BSP_VERTEX_STRIDE) * 3,
  );
  for (let v = 0; v < world.vertices.length; v += BSP_VERTEX_STRIDE) {
    const offset = (v / BSP_VERTEX_STRIDE) * 3;
    positions[offset] = -world.vertices[v + 1] / scale;
    positions[offset + 1] = world.vertices[v + 2] / scale;
    positions[offset + 2] = -world.vertices[v] / scale;
  }
  const indices: number[] = [];
  for (const face of faces) {
    for (let i = face.firstIndex; i < face.firstIndex + face.indexCount; i++)
      indices.push(world.indices[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return {
    geometry,
    pick({ ray, near, far }: THREE.Raycaster) {
      const { x, y, z } = ray.direction;
      const hit = raycastBspSurfaces(
        world,
        faces,
        bspPosition(ray.origin),
        [-z, -x, y],
        near * scale,
        far * scale,
      );
      if (!hit) return;
      return {
        distance: hit.distance / scale,
        point: worldPosition(hit.point, scale),
        normal: worldPosition(hit.normal, 1),
      };
    },
  };
}
