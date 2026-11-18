import * as THREE from "three/webgpu";
import {
  BALL_RADIUS,
  TABLE_HALF_LENGTH as L,
  TABLE_HALF_WIDTH as W,
} from "@harrhy/pool";
import {
  CABINET_BOUNDS,
  CUSHION_DEPTH,
  CUSHIONS,
  FELT_GEOMETRY,
  FELT_Y,
  POCKET_OPENING,
  RAIL_TOP_Y,
  SIDE_MOUTH,
} from "@harrhy/pool/table";
import type { PoolState } from "../shared/pool-wire";
import { UNITS_PER_METRE as scale } from "../shared/bsp-collision";

function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function createTableMesh() {
  const vertices: number[] = [];
  function box(
    size: [number, number, number],
    center: [number, number, number],
    color: number,
    rotation?: [number, number, number, number],
  ) {
    const geometry = new THREE.BoxGeometry(...size);
    if (rotation) geometry.applyQuaternion(new THREE.Quaternion(...rotation));
    geometry.translate(...center);
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const [r, g, b] = rgb(color);
    for (const i of geometry.getIndex()!.array) {
      const shade = 0.78 + 0.18 * normals.getY(i) - 0.08 * normals.getZ(i);
      vertices.push(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i),
        r * shade,
        g * shade,
        b * shade,
      );
    }
    geometry.dispose();
  }
  const wood = 0x5a3429,
    rail = 0x98603c,
    felt = 0x278064;
  const { x, z } = CABINET_BOUNDS;
  box([2 * x, 0.23, 2 * z], [0, 0.605, 0], wood);
  box(
    [2 * (W + CUSHION_DEPTH), 0.045, 2 * (L + CUSHION_DEPTH)],
    [0, 0.736, 0],
    0x231a18,
  );
  const rimWidth = x - W - CUSHION_DEPTH;
  const rimDepth = z - L - CUSHION_DEPTH;
  const rimHeight = RAIL_TOP_Y - 0.72;
  const rimY = RAIL_TOP_Y - rimHeight / 2;
  const sideStart = SIDE_MOUTH / 2;
  const sideEnd = L - POCKET_OPENING;
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      box(
        [0.22, 0.49, 0.25],
        [side * (x - 0.23), 0.245, end * (z - 0.34)],
        wood,
      );
      box(
        [rimWidth, rimHeight, sideEnd - sideStart],
        [side * (x - rimWidth / 2), rimY, (end * (sideStart + sideEnd)) / 2],
        rail,
      );
    }
    box(
      [2 * (W - POCKET_OPENING), rimHeight, rimDepth],
      [0, rimY, side * (z - rimDepth / 2)],
      rail,
    );
  }
  for (const cushion of CUSHIONS)
    box(cushion.size, cushion.center, felt, cushion.rotation);
  const [r, g, b] = rgb(felt);
  const { positions, indices } = FELT_GEOMETRY;
  for (const i of indices) {
    const y = positions[3 * i + 1]!;
    const shade = 1 - 30 * (FELT_Y - y);
    vertices.push(
      positions[3 * i]!,
      y,
      positions[3 * i + 2]!,
      r * shade,
      g * shade,
      b * shade,
    );
  }
  return new Float32Array(vertices);
}

const tableMesh = createTableMesh();
const ballMesh = new THREE.SphereGeometry(BALL_RADIUS, 12, 8);
const ballPositions = ballMesh.getAttribute("position");
const ballIndices = ballMesh.getIndex()!.array;
const ivory = rgb(0xf6f0df);
const colors = [
  ivory,
  ...[
    0xe8b72d, 0x315ca8, 0xc94336, 0x8350a2, 0xdc792b, 0x34846c, 0x8a2b32,
    0x171b1b,
  ].map(rgb),
];

export function appendPoolOverlay(
  out: number[],
  { table, balls }: PoolState,
  aim?: number,
) {
  const sin = Math.sin(table.yaw);
  const cos = Math.cos(table.yaw);
  function vertex(
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number,
  ) {
    // Rotate and translate from table space, then convert World metres to BSP.
    out.push(
      -(table.z - sin * x + cos * z) * scale,
      -(table.x + cos * x + sin * z) * scale,
      (table.y + y) * scale,
      -1,
      0,
      r,
      g,
      b,
    );
  }
  for (let i = 0; i < tableMesh.length; i += 6) {
    vertex(
      tableMesh[i]!,
      tableMesh[i + 1]!,
      tableMesh[i + 2]!,
      tableMesh[i + 3]!,
      tableMesh[i + 4]!,
      tableMesh[i + 5]!,
    );
  }
  for (const ball of balls) {
    const color = colors[ball.id > 8 ? ball.id - 8 : ball.id] ?? ivory;
    for (const i of ballIndices) {
      const x = ballPositions.getX(i),
        y = ballPositions.getY(i),
        z = ballPositions.getZ(i);
      const shade = 0.75 + (0.12 * x + 0.22 * y + 0.09 * z) / BALL_RADIUS;
      const [r, g, b] =
        ball.id > 8 && Math.abs(x) > 0.5 * BALL_RADIUS ? ivory : color;
      vertex(
        ball.x + x,
        ball.y + y,
        ball.z + z,
        r * shade,
        g * shade,
        b * shade,
      );
    }
  }
  const cue =
    aim === undefined ? undefined : balls.find((ball) => ball.id === 0);
  if (cue && aim !== undefined) {
    const dx = Math.cos(aim),
      dz = Math.sin(aim);
    const end = Math.min(
      1.4,
      dx === 0 ? Infinity : (Math.sign(dx) * W - cue.x) / dx,
      dz === 0 ? Infinity : (Math.sign(dz) * L - cue.z) / dz,
    );
    for (let start = BALL_RADIUS + 0.02; start < end; start += 0.085) {
      const stop = Math.min(start + 0.052, end);
      for (const [along, across] of [
        [start, -1],
        [stop, -1],
        [start, 1],
        [start, 1],
        [stop, -1],
        [stop, 1],
      ] as const) {
        vertex(
          cue.x + dx * along - dz * across * 0.008,
          FELT_Y + 0.006,
          cue.z + dz * along + dx * across * 0.008,
          1,
          0.91,
          0.62,
        );
      }
    }
  }
}
