import {
  createEmbeddedMapsScene,
  type EmbeddedMapsScene,
} from "@harrhy/worldview-renderer";
import * as THREE from "three/webgpu";
import { UNITS_PER_METRE as scale } from "../shared/bsp-collision";
import { billboardAtlasPath, loadBillboardLayout } from "./player-billboard";
import type { Pose } from "../shared/protocol";
import type { PoolState, PoolTable } from "../shared/pool-wire";
import { FELT_Y } from "@harrhy/pool/table";
import { ViewCamera } from "@harrhy/pool/presentation";
import { createPoolLayer } from "./pool-overlay";

export type FloorPoint = { x: number; z: number };
type View = {
  draw(
    local: Pose,
    remotes: readonly Pose[],
    destination?: FloorPoint,
    avatar?: Pose,
    orbitDistance?: number,
    pools?: readonly PoolState[],
    poolView?: { tableId: string; aim?: number; power?: number },
  ): void;
  /** Convert a canvas point to table-local felt coordinates while aiming. */
  pickPool(id: string, x: number, y: number): FloorPoint | undefined;
  panPool(dx: number, dy: number): void;
  hitPool(x: number, y: number): string | undefined;
  orbitPool(dx: number, dy: number): void;
  zoomPool(delta: number): void;
  projectPool(
    id: string,
    x: number,
    z: number,
  ): { x: number; y: number } | undefined;
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
  const tableCamera = new THREE.PerspectiveCamera(43, 1, 0.04, 60);
  tableCamera.coordinateSystem = THREE.WebGPUCoordinateSystem;
  let activeCamera = camera;
  const transitionCamera = new THREE.PerspectiveCamera(43, 1, 0.04, 60);
  transitionCamera.coordinateSystem = THREE.WebGPUCoordinateSystem;
  const rig = new ViewCamera(tableCamera);
  const anchor = new THREE.Vector3();
  let transition = 0;
  let lastDraw = 0;
  let tableView: PoolTable | undefined;
  let tables: readonly PoolState[] = [];
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
    pickPool(id, x, y) {
      const pickedTable = tables.find((p) => p.table.id === id)?.table;
      if (!pickedTable || !pointerRay(x, y)) return;
      const felt = new THREE.Plane(up, -(pickedTable.y + FELT_Y));
      const point = ray.ray.intersectPlane(felt, new THREE.Vector3());
      if (!point) return;
      point.sub(new THREE.Vector3(pickedTable.x, pickedTable.y, pickedTable.z));
      point.applyAxisAngle(up, -pickedTable.yaw);
      return { x: point.x, z: point.z };
    },
    projectPool(id, x, z) {
      const pickedTable = tables.find((p) => p.table.id === id)?.table;
      if (disposed || !drewFrame || !pickedTable) return;
      const rect = canvas.getBoundingClientRect();
      const point = new THREE.Vector3(x, FELT_Y, z)
        .applyAxisAngle(up, pickedTable.yaw)
        .add(new THREE.Vector3(pickedTable.x, pickedTable.y, pickedTable.z))
        .project(activeCamera);
      return {
        x: rect.left + ((point.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - point.y) * rect.height) / 2,
      };
    },
    panPool(dx, dy) {
      if (!tableView) return;
      rig.panBy(dx, dy, canvas.clientHeight);
    },
    orbitPool(dx, dy) {
      if (tableView) rig.orbitBy(dx, dy);
    },
    zoomPool(delta) {
      if (tableView) rig.zoomBy(delta);
    },
    hitPool(x, y) {
      if (!pointerRay(x, y)) return;
      let nearest = ray.intersectObject(hall, false)[0]?.distance ?? Infinity;
      let result: string | undefined;
      for (const pool of tables) {
        const graphics = poolLayer.graphics(pool.table.id);
        const hit = graphics && ray.intersectObject(graphics, true)[0];
        if (hit && hit.distance < nearest) {
          nearest = hit.distance;
          result = pool.table.id;
        }
      }
      return result;
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
      pools = [],
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
      const previous = tableView;
      tables = pools;
      tableView = pools.find((p) => p.table.id === poolView?.tableId)?.table;
      activeCamera = camera;
      let yaw = local.yaw;
      let pitch = local.pitch;
      if (tableView) {
        tableCamera.aspect = width / height;
        const entering = previous?.id !== tableView.id;
        if (entering) rig.recenter();
        rig.update(
          entering ? 10 : Math.min(0.1, (performance.now() - lastDraw) / 1000),
          anchor.set(0, 0, 0),
          "table",
          canvas.clientWidth < 700,
        );
        // The break cue ball starts on negative local Z.
        const cueEndYaw = tableView.yaw + Math.PI;
        tableCamera.position
          .applyAxisAngle(up, cueEndYaw)
          .add(anchor.set(tableView.x, tableView.y + FELT_Y, tableView.z));
        tableCamera.rotateOnWorldAxis(up, cueEndYaw);
        tableCamera.updateProjectionMatrix();
        tableCamera.updateMatrixWorld();
        activeCamera = tableCamera;
      } else {
        for (const player of remotes)
          appendBillboard(triangles, camera, player, layout);
      }
      const now = performance.now();
      const ease =
        1 - Math.exp(-Math.min(lastDraw ? now - lastDraw : 0, 100) * 0.009);
      lastDraw = now;
      transition = THREE.MathUtils.lerp(transition, tableView ? 1 : 0, ease);
      if (transition > 0.001) {
        transitionCamera.position
          .copy(camera.position)
          .lerp(tableCamera.position, transition);
        transitionCamera.quaternion
          .copy(camera.quaternion)
          .slerp(tableCamera.quaternion, transition);
        transitionCamera.aspect = camera.aspect;
        transitionCamera.fov = THREE.MathUtils.lerp(
          camera.fov,
          tableCamera.fov,
          transition,
        );
        transitionCamera.updateProjectionMatrix();
        transitionCamera.updateMatrixWorld();
        activeCamera = transitionCamera;
      }
      for (const pool of pools)
        if (pool.bot)
          appendBillboard(
            triangles,
            activeCamera,
            pool.bot,
            layout,
            [2.5, 0.45, 0.28],
          );
      const spriteLength = triangles.length;
      const rotation = new THREE.Euler().setFromQuaternion(
        activeCamera.quaternion,
        "YXZ",
      );
      yaw = rotation.y;
      pitch = rotation.x;
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
      poolLayer.draw(activeCamera, pools, poolView, triangles, spriteLength);

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
