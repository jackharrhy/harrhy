import {
  createEmbeddedMapsScene,
  type EmbeddedMapsScene,
} from "@harrhy/worldview-renderer";
import * as THREE from "three/webgpu";
import { UNITS_PER_METRE as scale } from "../shared/bsp-collision";
import { billboardAtlasPath, loadBillboardLayout } from "./player-billboard";
import type { Pose } from "../shared/protocol";

export type FloorPoint = { x: number; z: number };
type View = {
  draw(
    local: Pose,
    remotes: readonly Pose[],
    destination?: FloorPoint,
    avatar?: Pose,
    orbitDistance?: number,
  ): void;
  pickFloor(x: number, y: number): FloorPoint | undefined;
  dispose(): void;
};
type Layout = Awaited<ReturnType<typeof loadBillboardLayout>>;

function bspPosition({
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
const bspToWorld = new THREE.Matrix4().set(
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
const up = new THREE.Vector3(0, 1, 0);

function pickingMesh(world: EmbeddedMapsScene["world"]) {
  const positions = new Float32Array((world.vertices.length / 7) * 3);
  for (let v = 0; v < world.vertices.length; v += 7) {
    positions.set(
      [
        -world.vertices[v + 1] / scale,
        world.vertices[v + 2] / scale,
        -world.vertices[v] / scale,
      ],
      (v / 7) * 3,
    );
  }
  const indices: number[] = [];
  for (const face of world.faces) {
    if (
      !world.models[face.modelIndex]?.visible ||
      face.kind === "tool" ||
      face.kind === "sky"
    )
      continue;
    for (let i = face.firstIndex; i < face.firstIndex + face.indexCount; i++)
      indices.push(world.indices[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
}

function appendBillboard(
  out: number[],
  camera: THREE.PerspectiveCamera,
  player: Pose,
  layout: Layout,
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
    return [...bspPosition(position), u, v, 1, 1, 1];
  };
  const tl = quad(0, 0),
    tr = quad(1, 0),
    bl = quad(0, 1),
    br = quad(1, 1);
  out.push(...tl, ...bl, ...tr, ...tr, ...bl, ...br);
}

function appendMarker(
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

export async function createBspView(
  canvas: HTMLCanvasElement,
  bytes: ArrayBuffer,
): Promise<View> {
  const [layout, image] = await Promise.all([
    loadBillboardLayout(),
    fetch(billboardAtlasPath).then((response) => {
      if (!response.ok)
        throw new Error(`Loading billboard atlas: HTTP ${response.status}`);
      return response.blob();
    }),
  ]);
  const atlas = await createImageBitmap(image);
  let scene: EmbeddedMapsScene;
  try {
    scene = await createEmbeddedMapsScene({
      canvas,
      source: { bsp: bytes },
      overlayAtlas: atlas,
    });
  } finally {
    atlas.close();
  }
  for (const warning of scene.warnings) console.warn(warning.message);

  let hall: ReturnType<typeof pickingMesh>;
  try {
    hall = pickingMesh(scene.world);
  } catch (error) {
    scene.dispose();
    throw error;
  }
  const camera = new THREE.PerspectiveCamera(70, 1, 0.04, 60);
  camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
  const ray = new THREE.Raycaster(
    undefined,
    undefined,
    camera.near,
    camera.far,
  );
  const projectionView = new THREE.Matrix4();
  let floor: { point: THREE.Vector3; normal: THREE.Vector3 } | undefined;
  let drewFrame = false;
  let disposed = false;

  return {
    pickFloor(x, y) {
      if (disposed || !drewFrame) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      ray.setFromCamera(
        new THREE.Vector2(
          ((x - rect.left) / rect.width) * 2 - 1,
          1 - ((y - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      const hit = ray.intersectObject(hall, false)[0];
      if (!hit?.face || ray.ray.direction.y >= 0) return;
      const normal = hit.face.normal.clone();
      if (normal.dot(ray.ray.direction) > 0) normal.negate();
      if (normal.y < 0.7) return;
      floor = { point: hit.point, normal };
      return { x: hit.point.x, z: hit.point.z };
    },
    draw(local, remotes, destination, avatar, orbitDistance = 3.6) {
      if (disposed || !canvas.clientWidth || !canvas.clientHeight) return;
      const ratio = Math.min(window.devicePixelRatio, 1.75);
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (width !== canvas.width) canvas.width = width;
      if (height !== canvas.height) canvas.height = height;
      if (!drewFrame || camera.aspect !== width / height) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      camera.position.set(local.x, local.y + 1.65, local.z);
      camera.rotation.set(local.pitch, local.yaw, 0, "YXZ");
      if (avatar) {
        camera.position.y -= 0.5;
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(
          camera.quaternion,
        );
        ray.set(camera.position, back);
        const wall = ray.intersectObject(hall, false)[0];
        const distance = Math.min(
          orbitDistance,
          wall ? Math.max(0.08, wall.distance - 0.22) : Infinity,
        );
        camera.position.addScaledVector(back, distance);
        if (distance > 0.8) remotes = [...remotes, avatar];
      }
      camera.updateMatrixWorld();
      const triangles: number[] = [];
      for (const player of remotes)
        appendBillboard(triangles, camera, player, layout);
      if (destination) {
        if (
          floor &&
          floor.point.x === destination.x &&
          floor.point.z === destination.z
        ) {
          appendMarker(triangles, floor.point, floor.normal);
        } else {
          appendMarker(
            triangles,
            new THREE.Vector3(destination.x, local.y, destination.z),
            up,
          );
        }
      }
      scene.draw({
        projectionView: new Float32Array(
          projectionView
            .multiplyMatrices(
              camera.projectionMatrix,
              camera.matrixWorldInverse,
            )
            .multiply(bspToWorld).elements,
        ),
        camera: {
          position: bspPosition(camera.position),
          yaw: local.yaw,
          pitch: local.pitch,
          fieldOfView: camera.fov,
        },
        timeSeconds: performance.now() / 1000,
        overlay: new Float32Array(triangles),
      });
      drewFrame = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hall.geometry.dispose();
      hall.material.dispose();
      scene.dispose();
    },
  };
}
