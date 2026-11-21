import * as THREE from "three/webgpu";
import type { Pose } from "../shared/protocol";
import { bspPosition } from "./bsp-surfaces";
import type { loadBillboardLayout } from "./player-billboard";

const up = new THREE.Vector3(0, 1, 0);
type Layout = Awaited<ReturnType<typeof loadBillboardLayout>>;

export function appendBillboard(
  out: number[],
  camera: THREE.PerspectiveCamera,
  player: Pick<Pose, "x" | "y" | "z" | "yaw">,
  layout: Layout,
  tint: readonly number[] = [1, 1, 1],
) {
  const center = new THREE.Vector3(
    player.x,
    player.y + layout.playerCollider.heightMeters / 2,
    player.z,
  );
  const direction = camera.position
    .clone()
    .sub(center)
    .applyAxisAngle(up, -player.yaw);
  let index = 0;
  let best = -Infinity;
  for (let i = 0; i < layout.views.length; i++) {
    const dot = direction.dot(layout.views[i].viewDirection);
    if (dot > best) {
      best = dot;
      index = i;
    }
  }
  const col = index % layout.columns;
  const row = Math.floor(index / layout.columns);
  const quad = (x: number, y: number) => {
    const position = new THREE.Vector3(
      (x - 0.5) * layout.quad.widthMeters,
      (0.5 - y) * layout.quad.heightMeters,
      0,
    )
      .applyQuaternion(camera.quaternion)
      .add(center);
    const u =
      (col + (0.5 + x * (layout.frameWidth - 1)) / layout.frameWidth) /
      layout.columns;
    const v =
      (row + (0.5 + y * (layout.frameHeight - 1)) / layout.frameHeight) /
      layout.rows;
    return [...bspPosition(position), u, v, ...tint];
  };
  const tl = quad(0, 0),
    tr = quad(1, 0),
    bl = quad(0, 1),
    br = quad(1, 1);
  out.push(...tl, ...bl, ...tr, ...tr, ...bl, ...br);
}

export function appendMarker(
  out: number[],
  center: THREE.Vector3,
  normal: THREE.Vector3,
) {
  const rotation = new THREE.Quaternion().setFromUnitVectors(up, normal);
  const point = (angle: number, radius: number) => {
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      0.015,
      Math.sin(angle) * radius,
    )
      .applyQuaternion(rotation)
      .add(center);
    return [...bspPosition(position), -1, 0, 0.96, 0.82, 0.55];
  };
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    const b = ((i + 1) * Math.PI) / 16;
    const innerA = point(a, 0.14),
      outerA = point(a, 0.18);
    const innerB = point(b, 0.14),
      outerB = point(b, 0.18);
    out.push(...innerA, ...outerA, ...innerB, ...innerB, ...outerA, ...outerB);
  }
}
