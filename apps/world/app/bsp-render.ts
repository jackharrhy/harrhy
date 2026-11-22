import { CHESS_BOARD_Y, tableStand } from "../shared/table-placement";
import type { ChessState } from "../shared/chess-wire";
import {
  createEmbeddedMapsScene,
  type EmbeddedMapsScene,
} from "@harrhy/worldview-renderer";
import * as THREE from "three/webgpu";
import { bspPosition, bspToWorld, createHallSurfaces } from "./bsp-surfaces";
import { appendBillboard, appendMarker } from "./bsp-overlays";

import { billboardAtlasPath, loadBillboardLayout } from "./player-billboard";
import type { Pose } from "../shared/protocol";
import type { PoolState, PoolTable } from "../shared/pool-wire";
import { FELT_Y } from "@harrhy/pool/table";
import { ViewCamera } from "@harrhy/pool/presentation";
import { createTableLayer } from "./pool-overlay";
import { updateTableCamera } from "./table-camera";

import { UNITS_PER_METRE } from "../shared/bsp-collision";

const farClip = 160;
const up = new THREE.Vector3(0, 1, 0);

type FloorPoint = { x: number; z: number };
type View = {
  draw(
    local: Pose,
    remotes: readonly Pose[],
    destination?: FloorPoint,
    avatar?: Pose,
    orbitDistance?: number,
    pools?: readonly PoolState[],
    tableFocus?: {
      tableId: string;
      aim?: number;
      power?: number;
      blackSide?: boolean;
    },
    chessGames?: readonly ChessState[],
    selectedSquare?: string,
  ): void;
  /** Convert a canvas point to table-local felt coordinates while aiming. */
  pickTable(id: string, x: number, y: number): FloorPoint | undefined;
  panTable(dx: number, dy: number): void;
  hitTable(x: number, y: number): string | undefined;
  orbitTable(dx: number, dy: number): void;
  zoomTable(delta: number): void;
  projectPool(
    id: string,
    x: number,
    z: number,
  ): { x: number; y: number } | undefined;
  pickFloor(x: number, y: number): (FloorPoint & { y: number }) | undefined;
  dispose(): void;
};
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
      fog: { start: 35 * UNITS_PER_METRE, end: 105 * UNITS_PER_METRE },
    });
  } finally {
    atlas.close();
  }
  for (const warning of scene.warnings) console.warn(warning.message);

  const hall = createHallSurfaces(scene.world);
  let poolLayer: Awaited<ReturnType<typeof createTableLayer>>;
  try {
    poolLayer = await createTableLayer(canvas, hall.geometry);
  } catch (error) {
    hall.geometry.dispose();
    scene.dispose();
    throw error;
  }
  const camera = new THREE.PerspectiveCamera(70, 1, 0.04, farClip);
  camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
  const tableCamera = new THREE.PerspectiveCamera(43, 1, 0.04, farClip);
  tableCamera.coordinateSystem = THREE.WebGPUCoordinateSystem;
  let activeCamera = camera;
  const transitionCamera = new THREE.PerspectiveCamera(43, 1, 0.04, farClip);
  transitionCamera.coordinateSystem = THREE.WebGPUCoordinateSystem;
  const rig = new ViewCamera(tableCamera);
  let transition = 0;
  let lastDraw = 0;
  let tableView: PoolTable | undefined;
  let tables: readonly (PoolState | ChessState)[] = [];
  const ray = new THREE.Raycaster(undefined, undefined, camera.near, 60);
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
    pickTable(id, x, y) {
      const pickedTable = tables.find((p) => p.table.id === id)?.table;
      if (!pickedTable || !pointerRay(x, y)) return;
      const surface =
        tables.find((p) => p.table.id === id)?.type === "chess"
          ? CHESS_BOARD_Y
          : FELT_Y;
      const felt = new THREE.Plane(up, -(pickedTable.y + surface));
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
    panTable(dx, dy) {
      if (!tableView) return;
      rig.panBy(dx, dy, canvas.clientHeight);
    },
    orbitTable(dx, dy) {
      if (tableView) rig.orbitBy(dx, dy);
    },
    zoomTable(delta) {
      if (tableView) rig.zoomBy(delta);
    },
    hitTable(x, y) {
      if (!pointerRay(x, y)) return;
      let nearest = hall.pick(ray)?.distance ?? Infinity;
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
      if (ray.ray.direction.y >= 0) return;
      const hit = hall.pick(ray);
      if (!hit || hit.normal.y < 0.7) return;
      floor = hit;
      return { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    },
    draw(
      local,
      remotes,
      destination,
      avatar,
      orbitDistance = 3.6,
      pools = [],
      tableFocus,
      chessGames = [],
      selectedSquare,
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
      if (avatar && !tableFocus) {
        camera.position.y -= 0.5;
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(
          camera.quaternion,
        );
        ray.set(camera.position, back);
        const wall = hall.pick(ray);
        const distance = Math.min(
          orbitDistance,
          wall ? Math.max(0.08, wall.distance - 0.22) : Infinity,
        );
        camera.position.addScaledVector(back, distance);
        if (distance <= 0.8 && !tableFocus) avatar = undefined;
      }
      camera.updateMatrixWorld();
      const triangles: number[] = [];
      const previous = tableView;
      tables = [...pools, ...chessGames];
      const isChess = chessGames.some(
        (c) => c.table.id === tableFocus?.tableId,
      );
      tableView = tables.find((p) => p.table.id === tableFocus?.tableId)?.table;
      activeCamera = camera;
      if (tableView) {
        const entering = previous?.id !== tableView.id;
        updateTableCamera(tableCamera, rig, tableView, {
          aspect: width / height,
          entering,
          elapsed: entering
            ? 10
            : Math.min(0.1, (performance.now() - lastDraw) / 1000),
          compact: canvas.clientWidth < 700,
          isChess,
          blackSide: tableFocus?.blackSide,
        });
        activeCamera = tableCamera;
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
      for (const player of remotes)
        appendBillboard(triangles, activeCamera, player, layout);
      if (avatar) appendBillboard(triangles, activeCamera, avatar, layout);
      for (const pool of pools)
        if (pool.bot)
          appendBillboard(
            triangles,
            activeCamera,
            pool.bot,
            layout,
            [2.5, 0.45, 0.28],
          );
      for (const chess of chessGames)
        if (chess.table.houseBot)
          appendBillboard(
            triangles,
            activeCamera,
            tableStand(chess.table, "chess", 1),
            layout,
            [0.65, 1.25, 1.6],
          );
      const spriteLength = triangles.length;
      const rotation = new THREE.Euler().setFromQuaternion(
        activeCamera.quaternion,
        "YXZ",
      );
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
          yaw: rotation.y,
          pitch: rotation.x,
          fieldOfView: activeCamera.fov,
        },
        timeSeconds: performance.now() / 1000,
        overlay: new Float32Array(triangles),
      });
      poolLayer.draw(
        activeCamera,
        pools,
        tableFocus,
        triangles,
        spriteLength,
        chessGames,
        selectedSquare,
      );

      drewFrame = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      poolLayer.dispose();
      hall.geometry.dispose();
      scene.dispose();
    },
  };
}
