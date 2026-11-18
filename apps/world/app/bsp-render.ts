import {
  createEmbeddedMapsScene,
  type EmbeddedMapsScene,
} from "@harrhy/worldview-renderer";
import * as THREE from "three/webgpu";
import { UNITS_PER_METRE as scale } from "../shared/bsp-collision";
import { billboardAtlasPath, loadBillboardLayout } from "./player-billboard";
import type { Pose } from "../shared/protocol";
import type { PoolState, PoolTable } from "../shared/pool-wire";
import { CABINET_BOUNDS, FELT_Y } from "@harrhy/pool/table";
import { createPoolLayer } from "./pool-overlay";

export type FloorPoint = { x: number; z: number };
type View = {
  draw(
    local: Pose,
    remotes: readonly Pose[],
    destination?: FloorPoint,
    avatar?: Pose,
    orbitDistance?: number,
    pool?: PoolState,
    poolView?: { aim?: number; power?: number },
  ): void;
  /** Convert a canvas point to table-local felt coordinates while aiming. */
  pickPool(x: number, y: number): FloorPoint | undefined;
  hitPool(x: number, y: number): boolean;
  projectPool(x: number, z: number): { x: number; y: number } | undefined;
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

  const hall = pickingMesh(scene.world);
  let poolLayer: Awaited<ReturnType<typeof createPoolLayer>>;
  try {
    poolLayer = await createPoolLayer(canvas, hall.geometry);
  } catch (error) {
    hall.geometry.dispose();
    hall.material.dispose();
    scene.dispose();
    throw error;
  }
  const camera = new THREE.PerspectiveCamera(70, 1, 0.04, 60);
  camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
  const tableCamera = new THREE.PerspectiveCamera(48, 1, 0.04, 60);
  tableCamera.coordinateSystem = THREE.WebGPUCoordinateSystem;
  let activeCamera = camera;
  let tableView: PoolTable | undefined;
  let visibleTable = false;
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

  function pointerRay(x: number, y: number) {
    if (disposed || !drewFrame) return false;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    ray.setFromCamera(
      new THREE.Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        1 - ((y - rect.top) / rect.height) * 2,
      ),
      activeCamera,
    );
    return true;
  }
  return {
    pickPool(x, y) {
      if (!tableView || !pointerRay(x, y)) return;
      const felt = new THREE.Plane(up, -(tableView.y + FELT_Y));
      const point = ray.ray.intersectPlane(felt, new THREE.Vector3());
      if (!point) return;
      point.sub(new THREE.Vector3(tableView.x, tableView.y, tableView.z));
      point.applyAxisAngle(up, -tableView.yaw);
      return { x: point.x, z: point.z };
    },
    projectPool(x, z) {
      if (disposed || !drewFrame || !tableView) return;
      const rect = canvas.getBoundingClientRect();
      const point = new THREE.Vector3(x, FELT_Y, z)
        .applyAxisAngle(up, tableView.yaw)
        .add(new THREE.Vector3(tableView.x, tableView.y, tableView.z))
        .project(activeCamera);
      return {
        x: rect.left + ((point.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - point.y) * rect.height) / 2,
      };
    },
    hitPool(x, y) {
      if (!visibleTable || !pointerRay(x, y)) return false;
      const hit = ray.intersectObject(poolLayer.graphics, true)[0];
      if (!hit) return false;
      const wall = ray.intersectObject(hall, false)[0];
      return !wall || hit.distance < wall.distance;
    },
    pickFloor(x, y) {
      if (tableView || !pointerRay(x, y)) return;
      const hit = ray.intersectObject(hall, false)[0];
      if (!hit?.face || ray.ray.direction.y >= 0) return;
      const normal = hit.face.normal.clone();
      if (normal.dot(ray.ray.direction) > 0) normal.negate();
      if (normal.y < 0.7) return;
      floor = { point: hit.point, normal };
      return { x: hit.point.x, z: hit.point.z };
    },
    draw(
      local,
      remotes,
      destination,
      avatar,
      orbitDistance = 3.6,
      pool,
      poolView,
    ) {
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
      tableView = poolView ? pool?.table : undefined;
      activeCamera = camera;
      let yaw = local.yaw;
      let pitch = local.pitch;
      if (tableView) {
        const aspect = width / height;
        const { x, y, z, yaw: tableYaw } = tableView;
        // A side view suits landscape; a foot-end view keeps the table wide on phones.
        yaw = tableYaw + (aspect >= 1 ? -1.37 : 0.17);
        pitch = -0.94;
        tableCamera.aspect = aspect;
        tableCamera.rotation.set(pitch, yaw, 0, "YXZ");
        const center = new THREE.Vector3(x, y + FELT_Y, z);
        const inverseRotation = tableCamera.quaternion.clone().invert();
        const slope = Math.tan(THREE.MathUtils.degToRad(tableCamera.fov / 2));
        const corner = new THREE.Vector3();
        let distance = 2.0;
        for (const side of [-1, 1])
          for (const end of [-1, 1]) {
            corner.set(side * CABINET_BOUNDS.x, 0.08, end * CABINET_BOUNDS.z);
            corner
              .applyAxisAngle(up, tableYaw)
              .applyQuaternion(inverseRotation);
            distance = Math.max(
              distance,
              corner.z + Math.abs(corner.x) / (0.84 * slope * aspect),
              corner.z + Math.abs(corner.y) / (0.84 * slope),
            );
          }
        tableCamera.position
          .set(0, 0, distance)
          .applyQuaternion(tableCamera.quaternion)
          .add(center);
        tableCamera.updateProjectionMatrix();
        tableCamera.updateMatrixWorld();
        activeCamera = tableCamera;
      } else {
        for (const player of remotes)
          appendBillboard(triangles, camera, player, layout);
      }
      if (pool?.bot)
        appendBillboard(
          triangles,
          activeCamera,
          pool.bot,
          layout,
          [2.5, 0.45, 0.28],
        );
      const spriteLength = triangles.length;
      if (destination && !tableView) {
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
              activeCamera.projectionMatrix,
              activeCamera.matrixWorldInverse,
            )
            .multiply(bspToWorld).elements,
        ),
        camera: {
          position: bspPosition(activeCamera.position),
          yaw,
          pitch,
          fieldOfView: activeCamera.fov,
        },
        timeSeconds: performance.now() / 1000,
        overlay: new Float32Array(triangles),
      });
      poolLayer.draw(activeCamera, pool, poolView, triangles, spriteLength);
      visibleTable = !!pool;
      drewFrame = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      poolLayer.dispose();
      hall.geometry.dispose();
      hall.material.dispose();
      scene.dispose();
    },
  };
}
