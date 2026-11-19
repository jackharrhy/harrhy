import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { PieceSymbol } from "chess.js";
import type { ChessState } from "../shared/chess-wire";
import { CHESS_HALF_WIDTH, CHESS_BOARD_Y } from "../shared/table-placement";

const tile = 0.15;
export function squareAt(x: number, z: number) {
  const f = Math.floor(x / tile + 4),
    r = Math.floor(4 - z / tile);
  if (f >= 0 && f < 8 && r >= 0 && r < 8)
    return String.fromCharCode(97 + f) + (r + 1);
}
function pieceGeometry(type: PieceSymbol) {
  // Turned plinth, stem, collar and crown in local centimetres.
  const profile = [
    [0, 0],
    [5.4, 0],
    [5.4, 1],
    [4.9, 1.5],
    [5.1, 2],
    [4.3, 2.8],
    [3.3, 3.1],
    [2.2, 5],
    [1.9, 7],
    [3, 7.5],
    [3.3, 8.1],
    [2.7, 8.6],
  ];
  const crown: Record<PieceSymbol, number[][]> = {
    p: [
      [1.8, 8.8],
      [2.7, 10],
      [2.6, 11.5],
      [1.7, 12.7],
      [0, 13],
    ],
    r: [
      [3.4, 9],
      [4, 9.8],
      [4, 11],
      [0, 11],
    ],
    n: [[0, 8.6]],
    b: [
      [2.5, 9.1],
      [3.3, 10.5],
      [2.9, 12],
      [1.6, 13.6],
      [0.8, 15],
      [0, 15.4],
    ],
    q: [
      [2.3, 10],
      [3, 11.8],
      [4, 13.7],
      [3.8, 14.4],
      [1.3, 15],
      [1.4, 16],
      [0, 17],
    ],
    k: [
      [2.1, 10.5],
      [3.7, 12.8],
      [3.4, 14],
      [1.2, 14.7],
      [0, 14.7],
    ],
  };
  const parts = [
    new THREE.LatheGeometry(
      [...profile, ...crown[type]].map(([r, y]) => new THREE.Vector2(r, y)),
      24,
    ).toNonIndexed(),
  ];
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
  ) {
    parts.push(
      new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed(),
    );
  }
  if (type === "k") {
    box(1.35, 5.6, 1.35, 0, 16.3, 0);
    box(4.2, 1.25, 1.35, 0, 17, 0);
  }
  if (type === "r")
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      parts.push(
        new THREE.BoxGeometry(1.7, 1.6, 1.4)
          .translate(0, 11.6, 3.2)
          .rotateY(a)
          .toNonIndexed(),
      );
    }
  if (type === "n") {
    const horse = new THREE.Shape();
    horse.moveTo(-3, 8);
    for (const [x, y] of [
      [-3.8, 10],
      [-3, 13],
      [-1, 15.2],
      [-0.4, 17.1],
      [0.6, 15.8],
      [2, 16.3],
      [2, 15],
      [4.8, 12.8],
      [4.4, 11.6],
      [2.8, 11.5],
      [1.1, 12.2],
      [0.5, 10],
      [2.6, 8],
    ])
      horse.lineTo(x, y);
    horse.closePath();
    parts.push(
      new THREE.ExtrudeGeometry(horse, {
        depth: 2.5,
        bevelSize: 0.4,
        bevelThickness: 0.3,
        bevelSegments: 2,
      })
        .translate(0, 0, -1.25)
        .rotateY(Math.PI / 4),
    );
  }
  const geo = mergeGeometries(parts).scale(0.01, 0.01, 0.01);
  for (const part of parts) part.dispose();
  return geo;
}
export function createChessModel(state: ChessState) {
  const group = new THREE.Group();
  const { x, y, z, yaw } = state.table;
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  const material = (color: number) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.42 });
  const walnut = material(0x65412d),
    brass = material(0xbb8a43),
    white = material(0xffefd0),
    black = material(0x282736);
  function furniture(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat = walnut,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
  }
  const width = 2 * CHESS_HALF_WIDTH;
  furniture(width, 0.09, width, 0, CHESS_BOARD_Y - 0.05, 0);
  furniture(width - 0.02, 0.014, width - 0.02, 0, 0.78, 0, brass);
  furniture(1.24, 0.12, 1.24, 0, 0.73, 0);
  for (const x of [-0.54, 0.54])
    for (const z of [-0.54, 0.54]) {
      furniture(0.12, 0.7, 0.12, x, 0.35, z);
      furniture(0.14, 0.035, 0.14, x, 0.08, z, brass);
    }
  const board = new THREE.InstancedMesh(
    new THREE.BoxGeometry(tile, 0.012, tile),
    material(0xffffff),
    64,
  );
  group.add(board);
  const pieces = new THREE.Group();
  group.add(pieces);
  const shapes = new Map<PieceSymbol, THREE.BufferGeometry>();
  let previous: ChessState | undefined, previousSelection: string | undefined;
  function sync(state: ChessState, selected?: string) {
    if (state !== previous) {
      pieces.clear();
      for (const p of state.pieces) {
        let geo = shapes.get(p.type);
        if (!geo) {
          geo = pieceGeometry(p.type);
          shapes.set(p.type, geo);
        }
        const m = new THREE.Mesh(geo, p.color === "w" ? white : black);
        m.position.set(
          (p.square.charCodeAt(0) - 97 - 3.5) * tile,
          CHESS_BOARD_Y,
          (4.5 - Number(p.square[1])) * tile,
        );
        if (p.color === "b") m.rotation.y = Math.PI;
        pieces.add(m);
      }
    }
    if (state !== previous || selected !== previousSelection) {
      for (let i = 0; i < 64; i++) {
        const f = i % 8,
          r = Math.floor(i / 8);
        const x = (f - 3.5) * tile,
          z = (3.5 - r) * tile;
        const square = squareAt(x, z)!;
        board.setMatrixAt(
          i,
          new THREE.Matrix4().makeTranslation(x, CHESS_BOARD_Y - 0.006, z),
        );
        const legal =
          selected && state.legal.some((m) => m.startsWith(selected + square));
        board.setColorAt(
          i,
          new THREE.Color(
            square === selected
              ? 0xffc05c
              : legal
                ? 0x72b99b
                : (r + f) % 2
                  ? 0xe7c796
                  : 0x704c3d,
          ),
        );
      }
      board.instanceMatrix.needsUpdate = true;
      board.instanceColor!.needsUpdate = true;
    }
    previous = state;
    previousSelection = selected;
  }
  return {
    group,
    sync,
    dispose() {
      board.dispose();
      for (const geo of shapes.values()) geo.dispose();
      white.dispose();
      black.dispose();
    },
  };
}
