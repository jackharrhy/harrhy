import {
  entityValue,
  identifyBsp,
  parseBsp,
  tracePlayerHull,
  type Vec3Tuple,
} from "@harrhy/worldview-renderer/core";
import type { GoldSrcHullSweep } from "@harrhy/schmovement";
import { readPoolTable, withPoolCabinet } from "./pool-placement.ts";
import type { PoolTable } from "./pool-wire.ts";
import type { Pose } from "./protocol.ts";

export const UNITS_PER_METRE = 60;

export type BspCollision = {
  sweep: GoldSrcHullSweep;
  halfHeight: number;
  table?: PoolTable;
  revision: string;
  spawn: Pick<Pose, "x" | "y" | "z" | "grounded">;
};

export async function loadBspCollision(
  bytes: ArrayBuffer,
): Promise<BspCollision> {
  if (identifyBsp(bytes)?.format !== "goldsrc-bsp30")
    throw new Error("World requires a GoldSrc BSP30 map");
  const world = parseBsp(bytes);
  if (!world.collision || (world.models[0]?.headnodes[1] ?? -1) < 0)
    throw new Error("World map has no standing collision hull");

  // Hull 1 is already expanded for the GoldSrc standing player (32 × 32 × 72).
  const halfHeight = 36 / UNITS_PER_METRE;
  const collisionWorld = {
    collision: world.collision,
    entities: world.entities,
    models: world.models,
  };
  const table = readPoolTable(world.entities, UNITS_PER_METRE);
  const bspSweep: GoldSrcHullSweep = (start, end) =>
    tracePlayerHull(collisionWorld, start, end);
  const sweep = table
    ? withPoolCabinet(bspSweep, table, UNITS_PER_METRE)
    : bspSweep;
  const playerStart = world.entities.find(
    (entity) => entityValue(entity, "classname") === "info_player_start",
  );
  const origin =
    playerStart &&
    entityValue(playerStart, "origin")?.trim().split(/\s+/).map(Number);
  if (!origin || origin.length !== 3 || !origin.every(Number.isFinite))
    throw new Error(
      "World map requires an info_player_start with a valid hull-centre origin",
    );
  const start: Vec3Tuple = [origin[0], origin[1], origin[2]];
  const floor = sweep(start, [start[0], start[1], start[2] - 72]);
  if (
    floor.startSolid ||
    floor.allSolid ||
    floor.fraction === 1 ||
    floor.planeNormal[2] < 0.7
  )
    throw new Error(
      "World map spawn must be clear and within 72 units of walkable ground",
    );
  const [x, y, z] = floor.endPosition;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const digest = Array.from(hash, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return {
    halfHeight,
    table,
    sweep,
    revision: `bsp30-v1-${digest}`,
    spawn: {
      x: -y / UNITS_PER_METRE,
      y: z / UNITS_PER_METRE - halfHeight,
      z: -x / UNITS_PER_METRE,
      grounded: true,
    },
  };
}
